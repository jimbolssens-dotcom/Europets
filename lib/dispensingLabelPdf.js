// lib/dispensingLabelPdf.js
// Server-side only. Builds a small PDF of dispensing labels, one page per
// medication, sized for the clinic's actual label stock: a fixed 62mm x
// 100mm die-cut label (Brother DK-1202 or equivalent) loaded in the
// Brother QL-600. Unlike a continuous-tape roll, a die-cut label has a
// fixed physical size the printer can't vary per page, so every page here
// is the same size regardless of how much text it holds — content is
// top-aligned, leaving blank space at the bottom for a short label rather
// than trying to stretch to fill it.
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
const LABEL_HEIGHT = 100 * MM_TO_PT;
const MARGIN = 5 * MM_TO_PT;
const INK = rgb(0.125, 0.125, 0.125);
const GREY = rgb(0.4, 0.4, 0.4);
const LOGO_WIDTH = 14 * MM_TO_PT;

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

    const page = pdfDoc.addPage([LABEL_WIDTH, LABEL_HEIGHT]);
    let y = LABEL_HEIGHT - MARGIN;

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
