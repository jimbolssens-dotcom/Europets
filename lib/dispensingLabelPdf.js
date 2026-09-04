// lib/dispensingLabelPdf.js
// Server-side only. Builds a small PDF of dispensing labels, one page per
// medication, sized for a Brother QL-800 printing onto 62mm continuous
// tape (DK-22205/2251). The printer's driver treats each PDF page as one
// cut length of tape, so each page's height is computed to fit its own
// content instead of a fixed size — a short instruction doesn't waste as
// much tape as a long one.
//
// The QL-800 is strictly black-and-white (direct thermal), so everything
// here is grayscale — there's nothing to gain from designing in color,
// unlike the tax invoice PDF this borrows its layout conventions from.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'fs/promises';
import path from 'path';

const MM_TO_PT = 2.834645669;
const LABEL_WIDTH = 62 * MM_TO_PT;
const MARGIN = 5 * MM_TO_PT;
const MIN_HEIGHT = 22 * MM_TO_PT;
const MAX_HEIGHT = 80 * MM_TO_PT;
const INK = rgb(0.125, 0.125, 0.125);
const GREY = rgb(0.4, 0.4, 0.4);
const LOGO_WIDTH = 9 * MM_TO_PT;

function wrapText(str, useFont, size, maxWidth) {
  const words = String(str || '').split(/\s+/).filter(Boolean);
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
  const headerH = logoH; // reserved top band the logo sits in, right-aligned

  const contentWidth = LABEL_WIDTH - 2 * MARGIN;

  for (const item of items) {
    const patientLine = item.patientName || 'Patient';
    const ownerLine = item.ownerName ? `Owner: ${item.ownerName}` : '';
    const medLines = wrapText(item.medicationName || 'Medication', bold, 11, contentWidth);
    const instructionLines = wrapText(item.instructions || 'See clinic for instructions', font, 9, contentWidth);

    const contentHeight =
      headerH +
      (headerH > 0 ? 6 : 0) + // gap after header, only if there's a logo to clear
      14 + // patient name
      (ownerLine ? 11 : 0) +
      medLines.length * 13 +
      instructionLines.length * 11 +
      6 + // gap before date
      9; // date line

    const pageHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, contentHeight + 2 * MARGIN));
    const page = pdfDoc.addPage([LABEL_WIDTH, pageHeight]);
    let y = pageHeight - MARGIN;

    if (logoImage) {
      page.drawImage(logoImage, {
        x: LABEL_WIDTH - MARGIN - LOGO_WIDTH,
        y: y - logoH,
        width: LOGO_WIDTH,
        height: logoH,
      });
      y -= headerH + 6;
    }

    page.drawText(patientLine, { x: MARGIN, y, size: 12, font: bold, color: INK });
    y -= 14;

    if (ownerLine) {
      page.drawText(ownerLine, { x: MARGIN, y, size: 9, font, color: GREY });
      y -= 11;
    }

    for (const l of medLines) {
      page.drawText(l, { x: MARGIN, y, size: 11, font: bold, color: INK });
      y -= 13;
    }

    for (const l of instructionLines) {
      page.drawText(l, { x: MARGIN, y, size: 9, font, color: INK });
      y -= 11;
    }

    y -= 6;
    page.drawText(new Date().toLocaleDateString('en-AE'), { x: MARGIN, y, size: 7, font, color: GREY });
  }

  return pdfDoc.save();
}
