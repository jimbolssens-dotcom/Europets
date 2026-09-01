// app/api/hospitalizations/[id]/summary-pdf/route.js
// GET /api/hospitalizations/:id/summary-pdf -> a PDF summary of the
// admission and its day-to-day worksheet (with photos), for the vet to
// download and send to the client (e.g. attach in WhatsApp).

import { supabase } from '@/lib/supabaseClient';
import { buildHospitalizationSummaryPdf } from '@/lib/hospitalizationSummaryPdf';
import { NextResponse } from 'next/server';

export const maxDuration = 60;
// Route Handlers are cached per-URL by default in the App Router unless
// explicitly opted out — without this, re-downloading the same summary
// after adding a worksheet entry could keep serving the first PDF ever
// generated for this admission.
export const dynamic = 'force-dynamic';

// Keep the PDF (and this request) from ballooning if a case has a lot of photos.
const MAX_CASE_PHOTOS = 12;
const MAX_PHOTOS_PER_NOTE = 4;

function isImageAttachment(a) {
  return a.content_type?.startsWith('image/') || /\.(jpe?g|png)$/i.test(a.file_name || '');
}

async function fetchAttachmentBytes(attachment) {
  const { data, error } = await supabase.storage.from('consult-files').download(attachment.file_path);
  if (error || !data) return null;
  return {
    bytes: Buffer.from(await data.arrayBuffer()),
    contentType: attachment.content_type,
    fileName: attachment.file_name,
  };
}

export async function GET(request, { params }) {
  const { data: admission, error } = await supabase
    .from('hospitalizations')
    .select(
      '*, patients(id, name, species, current_weight_kg), clients(id, full_name, phone), rooms(name)'
    )
    .eq('id', params.id)
    .single();

  if (error || !admission) {
    return NextResponse.json({ error: 'admission not found' }, { status: 404 });
  }

  const { data: notesData } = await supabase
    .from('hospitalization_notes')
    .select('*, staff(full_name)')
    .eq('hospitalization_id', params.id)
    .order('note_date', { ascending: true });
  const notes = notesData || [];
  const noteIds = notes.map((n) => n.id);

  const [{ data: caseAttachments }, { data: noteAttachments }] = await Promise.all([
    supabase.from('attachments').select('*').eq('entity_type', 'hospitalization').eq('entity_id', params.id),
    noteIds.length
      ? supabase.from('attachments').select('*').eq('entity_type', 'hospitalization_note').in('entity_id', noteIds)
      : Promise.resolve({ data: [] }),
  ]);

  const caseImageAttachments = (caseAttachments || []).filter(isImageAttachment).slice(0, MAX_CASE_PHOTOS);
  const casePhotos = (await Promise.all(caseImageAttachments.map(fetchAttachmentBytes))).filter(Boolean);

  const noteImagesByNote = {};
  for (const a of (noteAttachments || []).filter(isImageAttachment)) {
    (noteImagesByNote[a.entity_id] ||= []).push(a);
  }

  const notePhotosMap = {};
  for (const note of notes) {
    const atts = (noteImagesByNote[note.id] || []).slice(0, MAX_PHOTOS_PER_NOTE);
    if (atts.length) {
      const photos = (await Promise.all(atts.map(fetchAttachmentBytes))).filter(Boolean);
      if (photos.length) notePhotosMap[note.id] = photos;
    }
  }

  const pdfBytes = await buildHospitalizationSummaryPdf({ admission, notes, casePhotos, notePhotosMap });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="hospitalization-summary-${params.id}.pdf"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
