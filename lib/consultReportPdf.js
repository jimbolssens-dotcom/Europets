// lib/consultReportPdf.js
// Server-side only. Builds a one-consult summary PDF (vitals, exam notes,
// diagnostics, treatment plan) for the vet to send to the client — same
// pdf-lib approach as lib/hospitalizationSummaryPdf.js (pure JS, fully
// embedded standard fonts, no font files read from disk at runtime, which
// avoids a common gotcha bundling font-file-reading PDF libraries into
// Vercel's serverless functions). Header/watermark/footer match
// lib/procedureReportPdf.js (dental/surgical/ultrasound/x-ray reports) so
// every report a client receives looks like it came from the same clinic.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'fs/promises';
import path from 'path';
import { formatDateTime } from '@/lib/formatTimestamp';

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const PINK = rgb(0.902, 0.094, 0.427); // #E6186D
const INK = rgb(0.125, 0.125, 0.125);
const GREY = rgb(0.4, 0.4, 0.4);
const LIGHT_RULE = rgb(0.85, 0.85, 0.85);

const TAGLINE = 'Kind, caring, and compassionate veterinary care';

async function loadLogoBytes() {
  try {
    return await readFile(path.join(process.cwd(), 'public', 'logo.png'));
  } catch {
    return null; // build still works without a logo present
  }
}

export async function buildConsultReportPdf({ visit, clinic, diagnostics = [], treatmentItems = [] }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const logoBytes = await loadLogoBytes();
  const logoImage = logoBytes ? await pdfDoc.embedPng(logoBytes) : null;
  const logoRatio = logoImage ? logoImage.height / logoImage.width : 1;

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
      color: LIGHT_RULE,
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

  // --- Header: logo + clinic identity on the left ---
  const headerTop = y;
  const logoW = 46;
  const logoH = logoImage ? logoW * logoRatio : 0;
  const textX = logoImage ? MARGIN + logoW + 14 : MARGIN;

  if (logoImage) {
    page.drawImage(logoImage, { x: MARGIN, y: headerTop - logoH, width: logoW, height: logoH });
  }

  const clinicName = clinic?.legal_name || 'Europets Veterinary Clinic';
  page.drawText(clinicName, { x: textX, y, size: 16, font: bold, color: PINK });
  y -= 18;
  page.drawText(TAGLINE, { x: textX, y, size: 9, font: italic, color: PINK });
  y -= 14;

  y = Math.min(y, headerTop - logoH) - 8;
  spacer(2);
  rule();
  spacer(10);

  drawText('Consult Report', { size: 14, useFont: bold, gap: 20 });

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
      drawText(d.goods_services?.name || d.description || d.type || 'Test', { useFont: bold, gap: 15 });
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

  // --- Watermark + footer on every page ---
  const pages = pdfDoc.getPages();
  const footerClinicLine = [clinicName, TAGLINE].join('  —  ');
  const generatedLine = `Generated ${new Date().toLocaleString()}`;

  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i];

    if (logoImage) {
      const wmW = 260;
      const wmH = wmW * logoRatio;
      pg.drawImage(logoImage, {
        x: (PAGE_WIDTH - wmW) / 2,
        y: (PAGE_HEIGHT - wmH) / 2,
        width: wmW,
        height: wmH,
        opacity: 0.06,
      });
    }

    pg.drawLine({
      start: { x: MARGIN, y: 44 },
      end: { x: PAGE_WIDTH - MARGIN, y: 44 },
      thickness: 1,
      color: LIGHT_RULE,
    });
    const footerW1 = font.widthOfTextAtSize(footerClinicLine, 8);
    pg.drawText(footerClinicLine, { x: (PAGE_WIDTH - footerW1) / 2, y: 30, size: 8, font, color: GREY });

    const footerLine2 =
      pages.length > 1 ? `Page ${i + 1} of ${pages.length}  ·  ${generatedLine}` : generatedLine;
    const footerW2 = font.widthOfTextAtSize(footerLine2, 7.5);
    pg.drawText(footerLine2, { x: (PAGE_WIDTH - footerW2) / 2, y: 18, size: 7.5, font, color: GREY });
  }

  return pdfDoc.save();
}
