// lib/procedureReportPdf.js
// Server-side only. Builds the ONE PDF a client gets after a surgical/
// dental procedure — patient/staff/date, the dental chart for dental
// reports, and the AI-drafted client report (see generateClientReport in
// lib/anthropicClient.js), which already covers both what was done and
// home-care instructions — for the vet to download, WhatsApp, or email
// to the owner. **bold**/bullet markdown in that text is rendered, not
// shown as literal asterisks (see lib/pdfMarkdownLite.js).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'fs/promises';
import path from 'path';
import { tokenizeInline, isHeadingLine, headingText, stripBullet } from '@/lib/pdfMarkdownLite';
import { getToothLayout, BOX_WIDTH, BOX_HEIGHT, TOOTH_COLORS } from '@/lib/dentalChartLayout';

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const PINK = rgb(0.902, 0.094, 0.427); // #E6186D
const INK = rgb(0.125, 0.125, 0.125);
const GREY = rgb(0.4, 0.4, 0.4);
const LIGHT_RULE = rgb(0.85, 0.85, 0.85);

const TAGLINE = 'Kind, caring, and compassionate veterinary care';

const PROCEDURE_TITLES = {
  surgical: 'Surgical Report',
  dental: 'Dental Report',
};

async function loadLogoBytes() {
  try {
    return await readFile(path.join(process.cwd(), 'public', 'logo.png'));
  } catch {
    return null; // build still works without a logo present
  }
}

export async function buildProcedureReportPdf({
  procedureType,
  procedureTitle,
  patient,
  client,
  clinic,
  performedAt,
  staffName,
  sections, // [{ label, text }] — only sections with non-empty text are drawn
  dentalChart, // { toothId: 'extracted' | 'missing' } — dental reports only
}) {
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

  // Wraps a run of mixed bold/regular words (already split from **markers**)
  // and draws each line with each word in its own font.
  function drawRichWords(words, { size = 11, color = INK, gap = 15, x = MARGIN } = {}) {
    const maxWidth = PAGE_WIDTH - MARGIN - x;
    const spaceWidth = font.widthOfTextAtSize(' ', size);
    const lines = [];
    let current = [];
    let currentWidth = 0;
    for (const w of words) {
      const useFont = w.bold ? bold : font;
      const wWidth = useFont.widthOfTextAtSize(w.word, size);
      const sep = current.length && !w.glue ? spaceWidth : 0;
      const addWidth = sep + wWidth;
      if (current.length && currentWidth + addWidth > maxWidth) {
        lines.push(current);
        current = [w];
        currentWidth = wWidth;
      } else {
        current.push(w);
        currentWidth += addWidth;
      }
    }
    if (current.length) lines.push(current);

    for (const line of lines) {
      newPageIfNeeded(gap);
      let cx = x;
      for (let i = 0; i < line.length; i++) {
        const w = line[i];
        const useFont = w.bold ? bold : font;
        if (i > 0 && !w.glue) cx += spaceWidth;
        page.drawText(w.word, { x: cx, y, size, font: useFont, color });
        cx += useFont.widthOfTextAtSize(w.word, size);
      }
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

  // Same **bold**/"-"-bullet-aware rendering as the post-op release PDF —
  // the AI structures ai_summary/notes with its own light markdown too.
  function drawRichText(text) {
    const rawLines = String(text || '').split(/\n/);
    for (const rawLine of rawLines) {
      if (!rawLine.trim()) {
        spacer(6);
        continue;
      }
      if (isHeadingLine(rawLine)) {
        spacer(4);
        drawText(headingText(rawLine), { size: 12, useFont: bold, color: PINK, gap: 17 });
        continue;
      }
      const { isBullet, text: lineText } = stripBullet(rawLine);
      const words = tokenizeInline(lineText);
      if (isBullet) {
        newPageIfNeeded(15);
        page.drawText('•', { x: MARGIN, y, size: 11, font, color: PINK });
        drawRichWords(words, { size: 11, gap: 15, x: MARGIN + 14 });
      } else {
        drawRichWords(words, { size: 11, gap: 15 });
      }
    }
  }

  // Draws the patient's dental chart at a fixed on-page width, scaling
  // the shared 0-BOX_WIDTH x 0-BOX_HEIGHT layout (lib/dentalChartLayout —
  // same one the on-screen chart uses) down to fit. Colors/positions
  // stay in lockstep with the app since both read the same layout data.
  function drawDentalChartSection(species, chart) {
    const layout = getToothLayout(species);
    if (!layout) return;

    const chartWidth = 260;
    const scale = chartWidth / BOX_WIDTH;
    const chartHeight = BOX_HEIGHT * scale;
    newPageIfNeeded(chartHeight + 30);

    drawText('Dental Chart', { size: 12, useFont: bold, color: PINK, gap: 17 });

    const boxLeft = (PAGE_WIDTH - chartWidth) / 2;
    const boxTop = y;
    page.drawRectangle({
      x: boxLeft,
      y: boxTop - chartHeight,
      width: chartWidth,
      height: chartHeight,
      color: rgb(0.98, 0.98, 0.98),
      borderColor: LIGHT_RULE,
      borderWidth: 1,
    });

    for (const tooth of layout) {
      const state = chart?.[tooth.id];
      const colors = TOOTH_COLORS[state] || TOOTH_COLORS.normal;
      const cx = boxLeft + tooth.cx * scale;
      const cy = boxTop - tooth.cy * scale;
      page.drawEllipse({
        x: cx,
        y: cy,
        xScale: tooth.rx * scale,
        yScale: tooth.ry * scale,
        color: hexToRgb(colors.fill),
        borderColor: hexToRgb(colors.stroke),
        borderWidth: 1,
      });
      const labelSize = 5.5;
      const labelWidth = font.widthOfTextAtSize(tooth.label, labelSize);
      page.drawText(tooth.label, { x: cx - labelWidth / 2, y: cy - 2, size: labelSize, font, color: INK });
    }

    y = boxTop - chartHeight - 10;

    const legendY = y;
    const legendItems = [
      ['Extracted', TOOTH_COLORS.extracted.fill, TOOTH_COLORS.extracted.stroke],
      ['Missing', TOOTH_COLORS.missing.fill, TOOTH_COLORS.missing.stroke],
      ['Present', TOOTH_COLORS.normal.fill, TOOTH_COLORS.normal.stroke],
    ];
    let lx = boxLeft;
    for (const [label, fill, stroke] of legendItems) {
      page.drawRectangle({
        x: lx,
        y: legendY - 8,
        width: 8,
        height: 8,
        color: hexToRgb(fill),
        borderColor: hexToRgb(stroke),
        borderWidth: 1,
      });
      page.drawText(label, { x: lx + 12, y: legendY - 8, size: 8, font, color: GREY });
      lx += 12 + font.widthOfTextAtSize(label, 8) + 14;
    }
    y = legendY - 20;
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

  drawText(procedureTitle || PROCEDURE_TITLES[procedureType] || 'Procedure Report', {
    size: 14,
    useFont: bold,
    gap: 20,
  });

  drawText(`Patient: ${patient?.name || '—'}${patient?.species ? ` (${patient.species})` : ''}`);
  drawText(`Owner: ${client?.full_name || '—'}`);
  if (staffName) {
    drawText(`Performed by: ${staffName}`);
  }
  if (performedAt) {
    drawText(`Date: ${new Date(performedAt).toLocaleString()}`);
  }

  if (procedureType === 'dental') {
    spacer(6);
    drawDentalChartSection(patient?.species, dentalChart);
  }

  spacer(8);
  rule();
  spacer(6);

  const filledSections = (sections || []).filter((s) => s.text && String(s.text).trim());
  if (filledSections.length === 0) {
    drawText('No report details recorded yet.', { color: GREY });
  }
  for (const section of filledSections) {
    if (section.label) {
      drawText(section.label, { size: 12, useFont: bold, color: PINK, gap: 17 });
    }
    drawRichText(section.text);
    spacer(6);
  }

  spacer(4);

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
