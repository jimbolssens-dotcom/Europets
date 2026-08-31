// lib/hospitalizationSummaryPdf.js
// Server-side only. Builds a one-page-plus PDF summarizing a hospitalization
// admission and its day-to-day worksheet, for the vet to send to the client
// (currently: download + share manually via WhatsApp). Uses pdf-lib rather
// than pdfkit — it's pure JS with fully embedded standard fonts, no font
// files read from disk at runtime, which avoids a common gotcha bundling
// font-file-reading PDF libraries into Vercel's serverless functions.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const PINK = rgb(0.902, 0.094, 0.427); // #E6186D
const INK = rgb(0.125, 0.125, 0.125);
const GREY = rgb(0.4, 0.4, 0.4);

export async function buildHospitalizationSummaryPdf({ admission, notes }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function newPageIfNeeded(minSpace) {
    if (y < MARGIN + minSpace) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  function wrapText(text, useFont, size, maxWidth) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (current && useFont.widthOfTextAtSize(test, size) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  }

  function drawText(text, { size = 11, useFont = font, color = INK, gap = 14 } = {}) {
    const maxWidth = PAGE_WIDTH - MARGIN * 2;
    for (const line of wrapText(text, useFont, size, maxWidth)) {
      newPageIfNeeded(gap);
      page.drawText(line, { x: MARGIN, y, size, font: useFont, color });
      y -= gap;
    }
  }

  function spacer(h) {
    y -= h;
  }

  function rule() {
    newPageIfNeeded(12);
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 1,
      color: rgb(0.9, 0.9, 0.9),
    });
    y -= 12;
  }

  drawText('Europets', { size: 20, useFont: bold, color: PINK, gap: 26 });
  drawText('Hospitalization Summary', { size: 13, useFont: bold, gap: 22 });

  drawText(`Patient: ${admission.patients?.name || '—'} (${admission.patients?.species || ''})`);
  drawText(`Owner: ${admission.clients?.full_name || '—'}`);
  drawText(`Room: ${admission.rooms?.name || '—'}`);
  drawText(`Admitted: ${new Date(admission.admitted_at).toLocaleString()}`);
  if (admission.discharged_at) {
    drawText(`Discharged: ${new Date(admission.discharged_at).toLocaleString()}`);
  }
  drawText(`Status: ${admission.status}`);
  if (admission.reason) {
    drawText(`Reason for admission: ${admission.reason}`);
  }
  spacer(8);
  rule();
  spacer(6);

  drawText('Day-to-day Worksheet', { size: 13, useFont: bold, color: PINK, gap: 20 });
  spacer(4);

  if (!notes || notes.length === 0) {
    drawText('No worksheet entries recorded.', { size: 11, color: GREY });
  }

  for (const n of notes || []) {
    newPageIfNeeded(28);
    drawText(`${n.note_date} — ${n.staff?.full_name || 'unassigned'}`, { size: 11, useFont: bold, gap: 15 });
    const bits = [];
    if (n.appetite) bits.push(`Appetite: ${n.appetite}`);
    if (n.temperature_c != null) bits.push(`Temp: ${n.temperature_c}°C`);
    if (bits.length) drawText(bits.join('   ·   '), { size: 10, color: GREY, gap: 13 });
    if (n.condition) drawText(`Condition: ${n.condition}`, { size: 10, gap: 13 });
    if (n.notes) drawText(n.notes, { size: 10, gap: 13 });
    spacer(8);
  }

  spacer(10);
  drawText(`Generated ${new Date().toLocaleString()}`, { size: 8, color: GREY, gap: 10 });

  return pdfDoc.save();
}
