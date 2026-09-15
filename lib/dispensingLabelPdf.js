// lib/dispensingLabelPdf.js
// Server-side only. Builds a small PDF of dispensing labels, one page per
// medication, sized for the Brother QL-600 printing onto 62mm continuous
// tape (not a die-cut label — the clinic confirmed the roll loaded in the
// printer is continuous). The printer's driver treats each PDF page as one
// cut length of tape, so the page height here is computed per label from
// how much text it holds (clamped between MIN_HEIGHT and MAX_HEIGHT)
// rather than fixed — a short label doesn't waste tape, and a long one
// still gets a page tall enough to fit.
//
// The QL-600 is strictly black-and-white (direct thermal), so everything
// here is grayscale — there's nothing to gain from designing in color,
// unlike the tax invoice PDF this borrows its layout conventions from.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'fs/promises';
import path from 'path';
import { sanitizeForFont } from '@/lib/pdfTextSafety';

const MM_TO_PT = 2.834645669;
const LABEL_WIDTH = 62 * MM_TO_PT;
const MARGIN = 5 * MM_TO_PT;
const MIN_HEIGHT = 22 * MM_TO_PT;
const MAX_HEIGHT = 80 * MM_TO_PT;
const INK = rgb(0.125, 0.125, 0.125);
const GREY = rgb(0.4, 0.4, 0.4);
const LOGO_WIDTH = 9 * MM_TO_PT;

function wrapText(rawStr, useFont, size, maxWidth) {
  const words = sanitizeForFont(useFont, rawStr || '').split(/\s+/).filter(Boolean);
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

async function loadLogoBytes() {
  try {
    return await readFile(path.join(process.cwd(), 'public', 'logo.png'));
  } catch {
    return null; // build still works without a logo present
  }
}

// items: [{ medicationName, instructions, patientName, ownerName }]
export async function buildDispensingLabelsPdf(items) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const logoBytes = await loadLogoBytes();
  const logoImage = logoBytes ? await pdfDoc.embedPng(logoBytes) : null;
  const logoRatio = logoImage ? logoImage.height / logoImage.width : 1;
  const logoH = logoImage ? LOGO_WIDTH * logoRatio : 0;

  const contentWidth = LABEL_WIDTH - 2 * MARGIN;

  for (const item of items) {
    const patientLine = item.patientName || 'Patient';
    const ownerLine = item.ownerName ? `Owner: ${item.ownerName}` : '';
    const medLines = wrapText(item.medicationName || 'Medication', bold, 13, contentWidth);
    const instructionLines = wrapText(item.instructions || 'See clinic for instructions', font, 11, contentWidth);

    const headerH = logoImage ? logoH + 8 : 0;
    const contentHeight =
      headerH +
      17 +
      (ownerLine ? 13 : 0) +
      4 +
      medLines.length * 15 +
      4 +
      instructionLines.length * 13 +
      9;
    const pageHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, contentHeight + 2 * MARGIN));

    const page = pdfDoc.addPage([LABEL_WIDTH, pageHeight]);
    let y = pageHeight - MARGIN;

    if (logoImage) {
      page.drawImage(logoImage, { x: (LABEL_WIDTH - LOGO_WIDTH) / 2, y: y - logoH, width: LOGO_WIDTH, height: logoH });
      y -= logoH + 8;
    }

    page.drawText(sanitizeForFont(bold, patientLine), { x: MARGIN, y, size: 15, font: bold, color: INK });
    y -= 17;

    if (ownerLine) {
      page.drawText(sanitizeForFont(font, ownerLine), { x: MARGIN, y, size: 10, font, color: GREY });
      y -= 13;
    }

    y -= 4;
    for (const l of medLines) {
      page.drawText(l, { x: MARGIN, y, size: 13, font: bold, color: INK });
      y -= 15;
    }

    y -= 4;
    for (const l of instructionLines) {
      page.drawText(l, { x: MARGIN, y, size: 11, font, color: INK });
      y -= 13;
    }

    page.drawText(new Date().toLocaleDateString('en-AE'), { x: MARGIN, y: MARGIN, size: 8, font, color: GREY });
  }

  return pdfDoc.save();
}
