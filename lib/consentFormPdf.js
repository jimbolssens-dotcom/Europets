// lib/consentFormPdf.js
// Server-side only. Builds the signed-record PDF for one consent form:
// clinic identity header, patient/client/reference details, the exact
// snapshotted form text, and the signature block. Uses pdf-lib (see
// hospitalizationSummaryPdf.js for why, over pdfkit).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'fs/promises';
import path from 'path';
import { CONSENT_FORM_LABELS } from '@/lib/consentTemplates';

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

export async function buildConsentFormPdf({ consentForm, patient, client, clinic }) {
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

  function wrapText(str, useFont, size, maxWidth) {
    const words = String(str).split(/\s+/).filter(Boolean);
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

  function text(str, x, { size = 10, useFont = font, color = INK } = {}) {
    page.drawText(String(str ?? ''), { x, y, size, font: useFont, color });
  }

  function rightText(str, rightEdge, { size = 10, useFont = bold, color = INK } = {}) {
    const w = useFont.widthOfTextAtSize(String(str ?? ''), size);
    text(str, rightEdge - w, { size, useFont, color });
  }

  function line(str, { size = 10, useFont = font, color = INK, gap = 14 } = {}) {
    newPageIfNeeded(gap);
    text(str, MARGIN, { size, useFont, color });
    y -= gap;
  }

  // A paragraph is wrapped across the full text width, one drawn line per
  // wrapped line — used for the form body, which is long-form prose.
  function paragraph(str, { size = 10.5, useFont = font, color = INK, gap = 14 } = {}) {
    const maxWidth = PAGE_WIDTH - MARGIN * 2;
    for (const l of wrapText(str, useFont, size, maxWidth)) {
      newPageIfNeeded(gap);
      text(l, MARGIN, { size, useFont, color });
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

  // --- Header: logo + clinic identity on the left, form meta on the right ---
  const headerTop = y;
  const logoW = 46;
  const logoH = logoImage ? logoW * logoRatio : 0;
  const textX = logoImage ? MARGIN + logoW + 14 : MARGIN;

  if (logoImage) {
    page.drawImage(logoImage, { x: MARGIN, y: headerTop - logoH, width: logoW, height: logoH });
  }

  const rightEdge = PAGE_WIDTH - MARGIN;
  rightText('CONSENT FORM', rightEdge, { useFont: bold, size: 15, color: PINK });
  y -= 16;
  rightText(`Signed: ${new Date(consentForm.signed_at).toLocaleString()}`, rightEdge, {
    useFont: font,
    size: 8.5,
    color: GREY,
  });

  y = headerTop;
  text(clinic?.legal_name || 'Europets Veterinary Clinic', textX, { useFont: bold, size: 14 });
  y -= 16;
  text(TAGLINE, textX, { useFont: italic, size: 9, color: PINK });
  y -= 12;
  const clinicContactBits = [clinic?.phone || null, clinic?.email || null, clinic?.address || null].filter(Boolean);
  if (clinicContactBits.length) {
    text(clinicContactBits.join('  ·  '), textX, { size: 8.5, color: GREY });
    y -= 11;
  }

  y = Math.min(y, headerTop - logoH) - 10;
  spacer(4);
  rule();
  spacer(10);

  // --- Title + patient/client reference ---
  line(CONSENT_FORM_LABELS[consentForm.form_type] || consentForm.form_type, {
    size: 13,
    useFont: bold,
    color: PINK,
    gap: 20,
  });
  spacer(2);
  line(`Patient: ${patient?.name || '—'}${patient?.species ? ` (${patient.species})` : ''}`, { gap: 14 });
  line(`Owner: ${client?.full_name || '—'}`, { gap: 14 });

  spacer(6);
  rule();
  spacer(10);

  // --- The signed form text — snapshotted verbatim at signing time ---
  const paragraphs = String(consentForm.form_text || '').split(/\n\n+/);
  for (const p of paragraphs) {
    paragraph(p, { gap: 14 });
    spacer(6);
  }

  spacer(6);
  rule();
  spacer(14);

  // --- Signature block ---
  newPageIfNeeded(90);
  line('Signed by:', { size: 9, useFont: bold, color: GREY, gap: 13 });
  line(consentForm.signed_by_name, { size: 12, useFont: bold, gap: 16 });
  if (consentForm.signed_by_relationship) {
    line(consentForm.signed_by_relationship, { size: 10, color: GREY, gap: 14 });
  }
  line(`Date/time: ${new Date(consentForm.signed_at).toLocaleString()}`, { size: 9, color: GREY, gap: 14 });
  if (consentForm.staff?.full_name) {
    line(`Witnessed by: ${consentForm.staff.full_name}`, { size: 9, color: GREY, gap: 14 });
  }

  // --- Watermark + footer on every page ---
  const pages = pdfDoc.getPages();
  const footerClinicLine = [clinic?.legal_name || 'Europets Veterinary Clinic', TAGLINE].join('  —  ');

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
    const footerLine2 = `Page ${i + 1} of ${pages.length}  ·  This is a computer-generated consent record.`;
    const footerW2 = font.widthOfTextAtSize(footerLine2, 7.5);
    pg.drawText(footerLine2, { x: (PAGE_WIDTH - footerW2) / 2, y: 18, size: 7.5, font, color: GREY });
  }

  return pdfDoc.save();
}
