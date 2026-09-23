// lib/pdfAttachments.js
// Shared helpers for pulling image attachments out of Supabase Storage to
// embed in a PDF — used by any *Pdf.js builder's route that wants photos
// in the export (hospitalizationSummaryPdf.js's route, procedureReportPdf.js's).

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export function isImageAttachment(a) {
  return a.content_type?.startsWith('image/') || /\.(jpe?g|png)$/i.test(a.file_name || '');
}

export async function fetchAttachmentBytes(attachment) {
  // Uses supabaseAdmin, not the anon client: Storage's .download() (unlike
  // getPublicUrl()) always goes through the bucket's RLS-gated object
  // endpoint regardless of the bucket's own "public" flag, so it needs the
  // service-role client now that the public SELECT policy on
  // storage.objects has been removed (see migrations/139).
  const { data, error } = await supabaseAdmin.storage.from('consult-files').download(attachment.file_path);
  if (error || !data) return null;
  return {
    bytes: Buffer.from(await data.arrayBuffer()),
    contentType: attachment.content_type,
    fileName: attachment.file_name,
  };
}
