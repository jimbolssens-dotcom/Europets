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
// report section shows instead of "No result recorded yet." separate: the
// files that couldn't be added as pages (see loadLabPdfs), which the owner
// opens on their own instead.
export function attachedLabReportText(files, separate = []) {
  const inline = files.filter((f) => !separate.includes(f));
  const names = (list) => list.map((f) => f.file_name || 'lab report').join(', ');
  const lines = [];
  if (inline.length) lines.push(`See the attached lab report (${names(inline)}) on the following page${inline.length === 1 ? '' : 's'}.`);
  if (separate.length) lines.push(`The lab report (${names(separate)}) is a separate file: open it from this test in the Europets app, or ask us and we'll send it.`);
  return lines.join('\n');
}

// Reads each attached lab PDF so it can go at the end of a report. One that
// is encrypted (some lab machines lock their PDFs; copied as they are, the
// pages come out blank), damaged or missing is marked usable: false, so its
// section can say where to find it instead of promising pages that aren't
// there. Returns [{ attachment, doc, usable }].
export async function loadLabPdfs(pdfAttachments) {
  if (!pdfAttachments?.length) return [];
  const { PDFDocument } = await import('pdf-lib');
  return Promise.all(
    pdfAttachments.map(async (attachment) => {
      const file = await fetchAttachmentBytes(attachment);
      if (!file) return { attachment, doc: null, usable: false };
      try {
        const doc = await PDFDocument.load(file.bytes);
        return { attachment, doc, usable: doc.getPageCount() > 0 };
      } catch (err) {
        console.error('Lab PDF not added to the report', attachment.file_name, err.message);
        return { attachment, doc: null, usable: false };
      }
    })
  );
}

// Appends every page of each usable lab PDF (from loadLabPdfs) to the end
// of a generated report, so the owner gets the actual lab result inside the
// one PDF.
export async function appendLabPdfs(reportBytes, loaded) {
  const usable = (loaded || []).filter((l) => l.usable);
  if (usable.length === 0) return reportBytes;
  const { PDFDocument } = await import('pdf-lib');
  const report = await PDFDocument.load(reportBytes);
  let added = 0;
  for (const { attachment, doc } of usable) {
    try {
      const pages = await report.copyPages(doc, doc.getPageIndices());
      pages.forEach((page) => report.addPage(page));
      added += pages.length;
    } catch (err) {
      console.error('Could not append lab PDF', attachment.file_name, err.message);
    }
  }
  return added > 0 ? report.save() : reportBytes;
}
