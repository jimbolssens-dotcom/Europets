// lib/attachmentCompression.js
// Once a consult or hospitalization is closed, its photos aren't going to
// be pulled up on the spot again the way they are while the case is
// active — so this shrinks them down to save Storage space. X-ray images
// keep a higher-quality target since detail there can still matter later
// (a referral, an insurance query); everything else (reception/procedure
// photos, blood-test result photos, hospitalization photos) drops to a
// much smaller target since those are just meant to stay readable.
//
// Idempotent and best-effort: only ever touches image attachments that
// haven't been compressed yet (attachments.compressed_at is null), and a
// failure on one file never blocks the others or the caller — this runs
// right after a status change that must succeed regardless.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { compressImageToTarget } from '@/lib/imageCompression';

const GENERAL_TARGET_BYTES = 300 * 1024;
const XRAY_TARGET_BYTES = 2 * 1024 * 1024;
const XRAY_PATTERN = /x-?ray|radiograph/i;

export function isXrayDiagnostic(diagnostic) {
  return XRAY_PATTERN.test(diagnostic?.goods_services?.name || diagnostic?.type || '');
}

// A day-worksheet entry (hospitalization_notes, with its treatment_items'
// goods_services names) whose photos are x-rays: the entry's text or an
// item logged on it names an x-ray/radiograph. Mirrors migration 192.
export function isXrayWorksheetEntry(note) {
  if (XRAY_PATTERN.test(note?.notes || '')) return true;
  return (note?.treatment_items || []).some((t) => XRAY_PATTERN.test(t?.goods_services?.name || ''));
}

// Every outcome but a transient error marks the attachment done
// (compressed_at), so a file that can't be compressed (missing, an image
// format sharp can't read) is never retried forever, which would also
// block the background sweep's oldest-first queue. Storage goes through
// supabaseAdmin: overwriting a file needs more than the public read access
// the anon client has.
async function markDone(attachment, extra = {}) {
  await supabaseAdmin.from('attachments').update({ compressed_at: new Date().toISOString(), ...extra }).eq('id', attachment.id);
}

async function compressOne(attachment, targetBytes) {
  try {
    const { data: blob, error: downloadError } = await supabaseAdmin.storage
      .from('consult-files')
      .download(attachment.file_path);
    if (downloadError || !blob) {
      await markDone(attachment);
      return 'missing';
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    if (buffer.length <= targetBytes) {
      await markDone(attachment);
      return 'already_small';
    }

    let compressed;
    try {
      compressed = await compressImageToTarget(buffer, targetBytes);
    } catch {
      await markDone(attachment);
      return 'unreadable';
    }
    if (!compressed || compressed.length >= buffer.length) {
      await markDone(attachment);
      return 'no_gain';
    }

    const { error: uploadError } = await supabaseAdmin.storage
      .from('consult-files')
      .upload(attachment.file_path, compressed, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) return 'error';

    await markDone(attachment, { content_type: 'image/jpeg' });
    return { saved: buffer.length - compressed.length };
  } catch {
    // Transient (network etc.): leave compressed_at null so the next sweep retries it.
    return 'error';
  }
}

// entityRefs: [{ entity_type, entity_id }, ...] covering every record whose
// attachments should be swept now that the parent case is closed.
// xrayEntityIds: entity_ids (of 'diagnostic' rows) that should get the
// higher-quality target instead of the general one.
export async function compressAttachmentsForClosedRecord(entityRefs, xrayEntityIds = new Set()) {
  if (!entityRefs?.length) return;

  const idsByType = new Map();
  for (const { entity_type, entity_id } of entityRefs) {
    if (!idsByType.has(entity_type)) idsByType.set(entity_type, []);
    idsByType.get(entity_type).push(entity_id);
  }

  const targets = [];
  for (const [entity_type, ids] of idsByType) {
    const { data } = await supabaseAdmin
      .from('attachments')
      .select('id, entity_id, file_path, content_type')
      .eq('entity_type', entity_type)
      .in('entity_id', ids)
      .is('compressed_at', null);
    for (const attachment of data || []) {
      if (attachment.content_type?.startsWith('image/')) targets.push(attachment);
    }
  }

  await Promise.all(
    targets.map((attachment) =>
      compressOne(attachment, xrayEntityIds.has(attachment.entity_id) ? XRAY_TARGET_BYTES : GENERAL_TARGET_BYTES)
    )
  );
}

// The background sweep (GET /api/attachments/compress-sweep, every 10
// minutes): compresses the oldest batch of photos that are ready (see
// migration 172's attachments_pending_compression for the rules: closed
// consults/stays, finished cattery stays, anything else after 2 days).
// A few at a time in parallel, and stops early to stay well inside the
// function's time limit.
export async function compressPendingAttachments({ batch = 24, parallel = 3, budgetMs = 45000 } = {}) {
  const started = Date.now();
  const { data: rows, error } = await supabaseAdmin.rpc('attachments_pending_compression', { max_rows: batch });
  if (error) throw new Error(error.message);
  const summary = { picked: rows?.length || 0, compressed: 0, skipped: 0, errors: 0, saved_bytes: 0 };
  const queue = [...(rows || [])];
  async function worker() {
    while (queue.length && Date.now() - started < budgetMs) {
      const row = queue.shift();
      const result = await compressOne(row, row.is_xray ? XRAY_TARGET_BYTES : GENERAL_TARGET_BYTES);
      if (result === 'error') summary.errors += 1;
      else if (typeof result === 'object') {
        summary.compressed += 1;
        summary.saved_bytes += result.saved;
      } else summary.skipped += 1;
    }
  }
  await Promise.all(Array.from({ length: parallel }, worker));
  return summary;
}
