// lib/postOpReleasePdf.js
// Server-side only. Builds the owner-facing "post-procedure care
// instructions" release form PDF for a surgical or dental report — the
// vet's saved, reviewed postop_instructions text, with patient/owner
// context and the clinic's contact info for questions. Uses pdf-lib (see
// hospitalizationSummaryPdf.js for why, over pdfkit).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const PINK = rgb(0.902, 0.094, 0.427); // #E6186D
const INK = rgb(0.125, 0.125, 0.125);
const GREY = rgb(0.4, 0.4, 0.4);

const PROCEDURE_TITLES = {
  surgical: 'Post-Surgical Care Instructions',
  dental: 'Post-Dental Care Instructions',
};

export async function buildPostOpReleasePdf({
  procedureType,
  procedureTitle,
  patient,
  client,
  clinic,
  performedAt,
  instructions,
}) {
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

  // The instructions text is AI-drafted/vet-edited free text with its own
  // blank-line-separated sections — draw each paragraph through drawText
  // (which wraps it) with a gap between paragraphs, instead of gluing
  // everything into one run-on flow.
  function drawParagraphs(text, opts) {
    const paragraphs = String(text || '').split(/\n+/);
    for (const p of paragraphs) {
      if (!p.trim()) {
        spacer(6);
        continue;
      }
      drawText(p.trim(), opts);
    }
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

  drawText(clinic?.legal_name || 'Europets Veterinary Clinic', { size: 18, useFont: bold, color: PINK, gap: 24 });
  drawText(procedureTitle || PROCEDURE_TITLES[procedureType] || 'Post-Procedure Care Instructions', {
    size: 13,
    useFont: bold,
    gap: 20,
  });

  drawText(`Patient: ${patient?.name || '—'}${patient?.species ? ` (${patient.species})` : ''}`);
  drawText(`Owner: ${client?.full_name || '—'}`);
  if (performedAt) {
    drawText(`Date: ${new Date(performedAt).toLocaleDateString()}`);
  }

  spacer(8);
  rule();
  spacer(6);

  drawParagraphs(instructions || 'No instructions recorded.', { size: 11, gap: 15 });

  spacer(10);
  rule();
  spacer(6);

  const contactBits = [clinic?.phone, clinic?.phone2, clinic?.email].filter(Boolean);
  if (contactBits.length) {
    drawText(`Questions? Contact us: ${contactBits.join('  ·  ')}`, { size: 9.5, color: GREY, gap: 13 });
  }
  drawText(`Generated ${new Date().toLocaleString()}`, { size: 8, color: GREY, gap: 10 });

  return pdfDoc.save();
}
