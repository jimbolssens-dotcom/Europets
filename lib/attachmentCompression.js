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

import { supabase } from '@/lib/supabaseClient';
import { compressImageToTarget } from '@/lib/imageCompression';

const GENERAL_TARGET_BYTES = 300 * 1024;
const XRAY_TARGET_BYTES = 900 * 1024;
const XRAY_PATTERN = /x-?ray|radiograph/i;

export function isXrayDiagnostic(diagnostic) {
  return XRAY_PATTERN.test(diagnostic?.goods_services?.name || diagnostic?.type || '');
}

async function compressOne(attachment, targetBytes) {
  try {
    const { data: blob, error: downloadError } = await supabase.storage
      .from('consult-files')
      .download(attachment.file_path);
    if (downloadError || !blob) return;

    const buffer = Buffer.from(await blob.arrayBuffer());
    if (buffer.length <= targetBytes) {
      await supabase.from('attachments').update({ compressed_at: new Date().toISOString() }).eq('id', attachment.id);
      return;
    }

    const compressed = await compressImageToTarget(buffer, targetBytes);
    if (!compressed || compressed.length >= buffer.length) {
      await supabase.from('attachments').update({ compressed_at: new Date().toISOString() }).eq('id', attachment.id);
      return;
    }

    const { error: uploadError } = await supabase.storage
      .from('consult-files')
      .upload(attachment.file_path, compressed, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) return;

    await supabase
      .from('attachments')
      .update({ content_type: 'image/jpeg', compressed_at: new Date().toISOString() })
      .eq('id', attachment.id);
  } catch {
    // Best-effort — leave compressed_at null so a later close/retry can pick it up.
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
    const { data } = await supabase
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
