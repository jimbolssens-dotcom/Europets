// lib/pdfAttachments.js
// Shared helpers for pulling image attachments out of Supabase Storage to
// embed in a PDF — used by any *Pdf.js builder's route that wants photos
// in the export (hospitalizationSummaryPdf.js's route, procedureReportPdf.js's).

import { supabase } from '@/lib/supabaseClient';

export function isImageAttachment(a) {
  return a.content_type?.startsWith('image/') || /\.(jpe?g|png)$/i.test(a.file_name || '');
}

export async function fetchAttachmentBytes(attachment) {
  const { data, error } = await supabase.storage.from('consult-files').download(attachment.file_path);
  if (error || !data) return null;
  return {
    bytes: Buffer.from(await data.arrayBuffer()),
    contentType: attachment.content_type,
    fileName: attachment.file_name,
  };
}
