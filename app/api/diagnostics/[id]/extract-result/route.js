// app/api/diagnostics/[id]/extract-result/route.js
// POST /api/diagnostics/:id/extract-result -> staff-triggered "AI
// interpretation" only (see the button in app/_components/RecordReports.jsx)
// — this never runs automatically on upload. Reads the diagnostic's most
// recently attached document/photo and reports ONLY the abnormal (or, for
// a PCR/pathogen panel, positive) findings: no normal values, no patient
// details, no client details. Reports reads this diagnostic directly; do
// not duplicate the text into visits.test_results. Imaging stays entirely
// out of scope — block it using the stored diagnostic identity before
// reading any bytes.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchAttachmentBytes } from '@/lib/pdfAttachments';
import { extractDiagnosticAbnormalities } from '@/lib/anthropicClient';
import { isImagingDiagnostic } from '@/lib/diagnosticReportPolicy';
import { NextResponse } from 'next/server';
import convert from 'heic-convert';

export const maxDuration = 60;

// iPhones default to saving camera photos as HEIC, which Claude's vision
// API doesn't accept (only jpeg/png/gif/webp) — see the same check in
// app/api/clients/scan-id/route.js.
const HEIC_RE = /hei[cf]/i;

function looksLikeHeic(contentType, fileName, buffer) {
  if (HEIC_RE.test(contentType || '') || HEIC_RE.test(fileName || '')) return true;
  if (buffer.length > 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12).toLowerCase();
    if (/^(heic|heix|heim|heis|hevc|hevx|mif1|msf1)$/.test(brand)) return true;
  }
  return false;
}

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const testNameHint = typeof body.test_name === 'string' ? body.test_name : '';

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
  if (isImagingDiagnostic(diagnostic, testNameHint)) {
    return NextResponse.json(
      {
        error: 'AI interpretation is disabled for X-rays and ultrasound; use dictation or typed findings for the report.',
        skipped: true,
      },
      { status: 409 }
    );
  }

  const { data: attachments, error: attachmentsError } = await supabaseAdmin
    .from('attachments')
    .select('file_path, file_name, content_type, created_at')
    .eq('entity_type', 'diagnostic')
    .eq('entity_id', params.id)
    .order('created_at', { ascending: false })
    .limit(1);
  if (attachmentsError) {
    return NextResponse.json({ error: attachmentsError.message }, { status: 500 });
  }
  const attachment = attachments?.[0];
  if (!attachment) {
    return NextResponse.json({ error: 'Attach the test result document first.' }, { status: 400 });
  }

  try {
    const fetched = await fetchAttachmentBytes(attachment);
    if (!fetched) {
      return NextResponse.json({ error: 'Could not read the attached file.' }, { status: 500 });
    }
    let buffer = fetched.bytes;
    let mediaType = fetched.contentType || 'image/jpeg';

    if (looksLikeHeic(mediaType, attachment.file_name, buffer)) {
      const jpegBytes = await convert({ buffer, format: 'JPEG', quality: 0.92 });
      buffer = Buffer.from(jpegBytes);
      mediaType = 'image/jpeg';
    }

    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'].includes(mediaType)) {
      return NextResponse.json({ error: 'The attached file must be a lab document in PDF, JPEG, PNG, GIF or WebP format.' }, { status: 400 });
    }
    const abnormalities = await extractDiagnosticAbnormalities(buffer, mediaType, diagnostic.goods_services?.name || testNameHint);
    const mergedResult = diagnostic.result?.trim() ? `${diagnostic.result.trim()}\n\n${abnormalities}` : abnormalities;

    const { data, error } = await supabaseAdmin
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
