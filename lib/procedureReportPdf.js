// lib/procedureReportPdf.js
// Server-side only. Builds a PDF of the surgical/dental report itself —
// procedure/findings, staff, and notes/AI summary — for the vet to
// download, WhatsApp, or email to the owner, same as the post-op release
// PDF (see postOpReleasePdf.js, which this mirrors: same branding, same
// **bold**/bullet rendering for the AI-drafted notes text).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'fs/promises';
import path from 'path';
import { tokenizeInline, isHeadingLine, headingText, stripBullet } from '@/lib/pdfMarkdownLite';

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

  spacer(8);
  rule();
  spacer(6);

  const filledSections = (sections || []).filter((s) => s.text && String(s.text).trim());
  if (filledSections.length === 0) {
    drawText('No report details recorded yet.', { color: GREY });
  }
  for (const section of filledSections) {
    drawText(section.label, { size: 12, useFont: bold, color: PINK, gap: 17 });
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
