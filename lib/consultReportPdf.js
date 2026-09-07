// lib/consultReportPdf.js
// Server-side only. Builds a one-consult summary PDF (vitals, exam notes,
// diagnostics, treatment plan) for the vet to send to the client — same
// pdf-lib approach as lib/hospitalizationSummaryPdf.js (pure JS, fully
// embedded standard fonts, no font files read from disk at runtime, which
// avoids a common gotcha bundling font-file-reading PDF libraries into
// Vercel's serverless functions).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { formatDateTime } from '@/lib/formatTimestamp';

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const PINK = rgb(0.902, 0.094, 0.427); // #E6186D
const INK = rgb(0.125, 0.125, 0.125);
const GREY = rgb(0.4, 0.4, 0.4);

export async function buildConsultReportPdf({ visit, diagnostics = [], treatmentItems = [] }) {
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

  function sectionHeading(text) {
    spacer(6);
    drawText(text, { size: 12, useFont: bold, color: PINK, gap: 17 });
    spacer(2);
  }

  function field(label, value) {
    if (value === null || value === undefined || value === '') return;
    drawText(`${label}: ${value}`);
  }

  drawText('Europets', { size: 20, useFont: bold, color: PINK, gap: 26 });
  drawText('Consult Report', { size: 13, useFont: bold, gap: 22 });

  drawText(`Patient: ${visit.patients?.name || '—'} (${visit.patients?.species || ''})`);
  drawText(`Owner: ${visit.clients?.full_name || '—'}`);
  drawText(`Vet: ${visit.staff?.full_name || 'unassigned'}`);
  drawText(`Room: ${visit.rooms?.name || '—'}`);
  drawText(`Date: ${formatDateTime(visit.started_at)}`);
  if (visit.ended_at) {
    drawText(`Completed: ${formatDateTime(visit.ended_at)}`);
  }

  spacer(8);
  rule();

  // AI-drafted, client-friendly summary (see generateConsultReport in
  // lib/anthropicClient.js) — drawn first, ahead of the raw clinical
  // record below, since it's the part actually meant for the owner to
  // read. Absent until a consult has been completed at least once.
  if (visit.ai_summary?.trim()) {
    sectionHeading('Summary for Owner');
    for (const paragraph of visit.ai_summary.trim().split(/\n+/)) {
      if (paragraph.trim()) drawText(paragraph.trim());
    }
    spacer(4);
    rule();
  }

  sectionHeading('Vitals');
  const vitals = [];
  if (visit.weight_kg != null) vitals.push(`Weight: ${visit.weight_kg} kg`);
  if (visit.temperature_c != null) vitals.push(`Temperature: ${visit.temperature_c}°C`);
  if (visit.body_condition_score != null) vitals.push(`Body Condition Score: ${visit.body_condition_score}/9`);
  drawText(vitals.length ? vitals.join('   ·   ') : 'Not recorded.', { color: vitals.length ? INK : GREY });

  sectionHeading('Exam');
  const hadExamField = [visit.anamnesis, visit.findings, visit.diagnosis, visit.prognosis, visit.treatment_notes].some(
    (v) => v
  );
  field('History (owner-reported)', visit.anamnesis);
  field('Findings', visit.findings);
  field('Diagnosis', visit.diagnosis);
  field('Prognosis', visit.prognosis);
  field('Treatment Notes', visit.treatment_notes);
  if (!hadExamField) {
    drawText('No exam notes recorded.', { color: GREY });
  }

  if (diagnostics.length) {
    sectionHeading('Diagnostics');
    for (const d of diagnostics) {
      newPageIfNeeded(28);
      drawText(d.description || d.type || 'Test', { useFont: bold, gap: 15 });
      if (d.result) drawText(d.result, { size: 10, gap: 13 });
      spacer(4);
    }
  }

  if (treatmentItems.length) {
    sectionHeading('Treatment Plan');
    for (const t of treatmentItems) {
      newPageIfNeeded(28);
      const qty = t.quantity && t.quantity !== 1 ? ` x${t.quantity}` : '';
      drawText(`${t.goods_services?.name || 'Item'}${qty}`, { useFont: bold, gap: 15 });
      if (t.instructions) drawText(t.instructions, { size: 10, gap: 13 });
      spacer(4);
    }
  }

  spacer(10);
  drawText(`Generated ${new Date().toLocaleString()}`, { size: 8, color: GREY, gap: 10 });

  return pdfDoc.save();
}
