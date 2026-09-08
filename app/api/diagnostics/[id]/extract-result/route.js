// app/api/diagnostics/[id]/extract-result/route.js
// POST /api/diagnostics/:id/extract-result  -> read a photo of a test
// result (FormData: `image`, optional `test_name` for context) and append
// the extracted text to both this diagnostic's own result field AND the
// consult's Tests field (visits.test_results — see migration 080), so a
// vet reviewing Vitals & Exam sees every test result in one place instead
// of having to open each diagnostic's own card. The photo itself is saved
// separately as a regular attachment (see AttachmentSection); the consult
// page deletes it once this call succeeds, since its contents are now
// captured as text — this route only reads it, never deletes it itself.

import { supabase } from '@/lib/supabaseClient';
import { extractDiagnosticResult } from '@/lib/anthropicClient';
import { NextResponse } from 'next/server';
import convert from 'heic-convert';

export const maxDuration = 60;

// iPhones default to saving camera photos as HEIC, which Claude's vision
// API doesn't accept (only jpeg/png/gif/webp) — see the same check in
// app/api/clients/scan-id/route.js.
const HEIC_RE = /hei[cf]/i;

function looksLikeHeic(file, buffer) {
  if (HEIC_RE.test(file.type) || HEIC_RE.test(file.name || '')) return true;
  if (buffer.length > 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12).toLowerCase();
    if (/^(heic|heix|heim|heis|hevc|hevx|mif1|msf1)$/.test(brand)) return true;
  }
  return false;
}

export async function POST(request, { params }) {
  const formData = await request.formData();
  const image = formData.get('image');
  const testName = formData.get('test_name') || '';

  if (!image || typeof image === 'string') {
    return NextResponse.json({ error: 'image file is required' }, { status: 400 });
  }

  const { data: diagnostic, error: fetchError } = await supabase
    .from('diagnostics')
    .select('result, visit_id')
    .eq('id', params.id)
    .single();
  if (fetchError || !diagnostic) {
    return NextResponse.json({ error: 'diagnostic not found' }, { status: 404 });
  }

  try {
    let buffer = Buffer.from(await image.arrayBuffer());
    let mediaType = image.type || 'image/jpeg';

    if (looksLikeHeic(image, buffer)) {
      const jpegBytes = await convert({ buffer, format: 'JPEG', quality: 0.92 });
      buffer = Buffer.from(jpegBytes);
      mediaType = 'image/jpeg';
    }

    const extracted = await extractDiagnosticResult(buffer, mediaType, testName);
    const mergedResult = diagnostic.result?.trim() ? `${diagnostic.result.trim()}\n\n${extracted}` : extracted;

    const { data, error } = await supabase
      .from('diagnostics')
      .update({ result: mergedResult })
      .eq('id', params.id)
      .select()
      .single();
    if (error) throw error;

    // Checked and thrown on failure, not best-effort — the consult page
    // deletes the source photo as soon as this whole request succeeds (see
    // the file header), so a silently-swallowed error here would mean the
    // photo's gone with nothing to show for it in Vitals & Exam.
    const { data: visit, error: visitFetchError } = await supabase
      .from('visits')
      .select('test_results')
      .eq('id', diagnostic.visit_id)
      .single();
    if (visitFetchError) throw visitFetchError;

    const testEntry = testName ? `${testName}: ${extracted}` : extracted;
    const mergedTestResults = visit.test_results?.trim()
      ? `${visit.test_results.trim()}\n\n${testEntry}`
      : testEntry;
    const { error: visitUpdateError } = await supabase
      .from('visits')
      .update({ test_results: mergedTestResults })
      .eq('id', diagnostic.visit_id);
    if (visitUpdateError) throw visitUpdateError;

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
