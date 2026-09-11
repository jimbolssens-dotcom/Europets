// app/api/diagnostics/[id]/extract-result/route.js
// Transcribe a laboratory document into its diagnostic result, including
// factual abnormalities. Original files remain attached. Reports reads this
// diagnostic directly; do not duplicate the text into visits.test_results.
// Block imaging using the stored diagnostic identity before reading bytes.

import { supabase } from '@/lib/supabaseClient';
import { extractDiagnosticResult } from '@/lib/anthropicClient';
import { isImagingDiagnostic } from '@/lib/diagnosticReportPolicy';
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

  // Hard safety boundary for diagnostic imaging: the image has already been
  // uploaded as an attachment before this endpoint is called. Do not read,
  // convert, describe, OCR, or otherwise pass it to the AI vision pipeline.
  const { data: diagnostic, error: fetchError } = await supabase
    .from('diagnostics')
    .select('result, visit_id, type, goods_services(name)')
    .eq('id', params.id)
    .single();
  if (fetchError || !diagnostic) {
    return NextResponse.json({ error: 'diagnostic not found' }, { status: 404 });
  }
  if (isImagingDiagnostic(diagnostic, testName)) {
    return NextResponse.json(
      {
        error:
          'Imaging image saved. AI interpretation is disabled for X-rays and ultrasound; use dictation or typed findings for the report.',
        imaging_saved: true,
      },
      { status: 409 }
    );
  }

  try {
    if (image.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'Upload a document smaller than 20 MB.' }, { status: 400 });
    let buffer = Buffer.from(await image.arrayBuffer());
    let mediaType = image.type || 'image/jpeg';

    if (looksLikeHeic(image, buffer)) {
      const jpegBytes = await convert({ buffer, format: 'JPEG', quality: 0.92 });
      buffer = Buffer.from(jpegBytes);
      mediaType = 'image/jpeg';
    }

    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'].includes(mediaType)) {
      return NextResponse.json({ error: 'Use a lab document in PDF, JPEG, PNG, GIF or WebP format.' }, { status: 400 });
    }
    const extracted = await extractDiagnosticResult(buffer, mediaType, diagnostic.goods_services?.name || testName);
    const mergedResult = diagnostic.result?.trim() ? `${diagnostic.result.trim()}\n\n${extracted}` : extracted;

    const { data, error } = await supabase
      .from('diagnostics')
      .update({ result: mergedResult })
      .eq('id', params.id)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
