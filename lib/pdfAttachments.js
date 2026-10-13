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

export function isPdfAttachment(a) {
  return a.content_type === 'application/pdf' || /\.pdf$/i.test(a.file_name || '');
}

// A test whose result is an attached lab PDF (not typed in): the line its
// report section shows instead of "No result recorded yet."
export function attachedLabReportText(files) {
  const names = files.map((f) => f.file_name || 'lab report').join(', ');
  return `See the attached lab report (${names}) on the following page${files.length === 1 ? '' : 's'}.`;
}

// Appends every page of each attached lab PDF to the end of a generated
// report, so the owner gets the actual lab result inside the one PDF. A
// file that can't be read (damaged, password-protected) is skipped rather
// than failing the whole report.
export async function appendPdfAttachments(reportBytes, pdfAttachments) {
  if (!pdfAttachments || pdfAttachments.length === 0) return reportBytes;
  const { PDFDocument } = await import('pdf-lib');
  const report = await PDFDocument.load(reportBytes);
  let added = 0;
  for (const attachment of pdfAttachments) {
    const file = await fetchAttachmentBytes(attachment);
    if (!file) continue;
    try {
      const lab = await PDFDocument.load(file.bytes, { ignoreEncryption: true });
      const pages = await report.copyPages(lab, lab.getPageIndices());
      pages.forEach((page) => report.addPage(page));
      added += pages.length;
    } catch (err) {
      console.error('Could not append lab PDF', attachment.file_name, err.message);
    }
  }
  return added > 0 ? report.save() : reportBytes;
}
