// lib/taxInvoicePdf.js
// Server-side only. Builds a UAE FTA-compliant Tax Invoice PDF: logo +
// clinic identity/TRN in the header, recipient details, a sequential
// invoice number, per-line VAT rate, the subtotal/VAT/total breakdown in
// AED, a faint logo watermark, and a branded footer on every page.
// Uses pdf-lib (see hospitalizationSummaryPdf.js for why, over pdfkit).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'fs/promises';
import path from 'path';
import { VAT_RATE } from '@/lib/invoicing';

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const PINK = rgb(0.902, 0.094, 0.427); // #E6186D
const INK = rgb(0.125, 0.125, 0.125);
const GREY = rgb(0.4, 0.4, 0.4);
const LIGHT_RULE = rgb(0.85, 0.85, 0.85);

const TAGLINE = 'Kind, caring, and compassionate veterinary care';

function money(n) {
  return Number(n || 0).toFixed(2);
}

function invoiceNumberText(n) {
  return `INV-${String(n).padStart(6, '0')}`;
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

async function loadLogoBytes() {
  try {
    return await readFile(path.join(process.cwd(), 'public', 'logo.png'));
  } catch {
    return null; // build still works without a logo present
  }
}

export async function buildTaxInvoicePdf({ invoice, lineItems, clinic, client, patient }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const logoBytes = await loadLogoBytes();
  const logoImage = logoBytes ? await pdfDoc.embedPng(logoBytes) : null;
  const logoRatio = logoImage ? logoImage.height / logoImage.width : 1;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  let pageNum = 1;

  function newPageIfNeeded(minSpace) {
    if (y < MARGIN + minSpace) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      pageNum += 1;
      text(`Tax Invoice ${invoiceNumberText(invoice.invoice_number)} (continued)`, MARGIN, {
        size: 9,
        color: GREY,
      });
      y -= 20;
    }
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

  // --- Header: logo + clinic identity on the left, "TAX INVOICE" meta on the right ---
  const headerTop = y;
  const logoW = 46;
  const logoH = logoImage ? logoW * logoRatio : 0;
  const textX = logoImage ? MARGIN + logoW + 14 : MARGIN;

  if (logoImage) {
    page.drawImage(logoImage, { x: MARGIN, y: headerTop - logoH, width: logoW, height: logoH });
  }

  const rightEdge = PAGE_WIDTH - MARGIN;
  rightText('TAX INVOICE', rightEdge, { useFont: bold, size: 16, color: PINK });
  y -= 18;
  rightText(invoiceNumberText(invoice.invoice_number), rightEdge, { useFont: bold, size: 11 });
  y -= 14;
  rightText(`Issue date: ${new Date(invoice.created_at).toLocaleDateString('en-AE')}`, rightEdge, {
    useFont: font,
    size: 9,
    color: GREY,
  });
  y -= 12;
  rightText(`Status: ${invoice.status}`, rightEdge, { useFont: font, size: 9, color: GREY });

  y = headerTop;
  text(clinic?.legal_name || 'Europets Veterinary Clinic', textX, { useFont: bold, size: 14 });
  y -= 16;
  text(TAGLINE, textX, { useFont: italic, size: 9, color: PINK });
  y -= 12;
  const clinicMetaBits = [
    clinic?.trn ? `TRN: ${clinic.trn}` : null,
    clinic?.address || null,
  ].filter(Boolean);
  if (clinicMetaBits.length) {
    text(clinicMetaBits.join('  ·  '), textX, { size: 8.5, color: GREY });
    y -= 11;
  }
  const clinicContactBits = [clinic?.phone || null, clinic?.phone2 || null, clinic?.email || null].filter(
    Boolean
  );
  if (clinicContactBits.length) {
    text(clinicContactBits.join('  ·  '), textX, { size: 8.5, color: GREY });
    y -= 11;
  }

  y = Math.min(y, headerTop - logoH) - 10;
  spacer(4);
  rule();
  spacer(10);

  // --- Bill To: client details, then patient details underneath ---
  text('Bill To', MARGIN, { size: 9, useFont: bold, color: GREY });
  y -= 14;

  const clientHeaderBits = [
    client?.full_name || '—',
    client?.client_number ? `(Client #${client.client_number})` : null,
  ].filter(Boolean);
  line(clientHeaderBits.join('  '), { size: 11, useFont: bold, gap: 14 });

  const clientContactBits = [
    client?.phone ? `Phone: ${client.phone}` : null,
    client?.email ? `Email: ${client.email}` : null,
  ].filter(Boolean);
  if (clientContactBits.length) {
    line(clientContactBits.join('   ·   '), { size: 9.5, gap: 13 });
  }
  if (client?.address) {
    line(client.address, { size: 9.5, gap: 13 });
  }
  if (client?.trn) {
    line(`Client TRN: ${client.trn}`, { size: 9.5, gap: 13 });
  }

  if (patient) {
    spacer(3);
    const patientHeaderBits = [
      `Patient: ${patient.name || '—'}`,
      patient.patient_number ? `(Patient #${patient.patient_number})` : null,
    ].filter(Boolean);
    line(patientHeaderBits.join('  '), { size: 10.5, useFont: bold, gap: 13 });

    const patientMetaBits = [
      patient.species ? `Species: ${patient.species}` : null,
      patient.microchip_number ? `Microchip: ${patient.microchip_number}` : null,
    ].filter(Boolean);
    if (patientMetaBits.length) {
      line(patientMetaBits.join('   ·   '), { size: 9.5, color: GREY, gap: 13 });
    }
  }

  spacer(6);
  rule();
  spacer(10);

  // --- Line items table ---
  const cols = {
    desc: MARGIN,
    qty: MARGIN + 260,
    unit: MARGIN + 310,
    vat: MARGIN + 390,
    total: MARGIN + 440,
  };

  newPageIfNeeded(16);
  text('Description', cols.desc, { size: 9, useFont: bold, color: GREY });
  text('Qty', cols.qty, { size: 9, useFont: bold, color: GREY });
  text('Unit (AED)', cols.unit, { size: 9, useFont: bold, color: GREY });
  text('VAT', cols.vat, { size: 9, useFont: bold, color: GREY });
  text('Total (AED)', cols.total, { size: 9, useFont: bold, color: GREY });
  y -= 16;
  rule();

  const vatPercent = `${Math.round(VAT_RATE * 100)}%`;
  const maxDescWidth = cols.qty - cols.desc - 8;

  for (const item of lineItems) {
    const descLines = wrapText(item.description || '', font, 10, maxDescWidth);
    newPageIfNeeded(descLines.length * 13 + 4);
    const rowTop = y;
    let dy = rowTop;
    for (const l of descLines) {
      page.drawText(l, { x: cols.desc, y: dy, size: 10, font, color: INK });
      dy -= 13;
    }
    text(String(item.quantity), cols.qty, { size: 10 });
    text(money(item.unit_price), cols.unit, { size: 10 });
    text(vatPercent, cols.vat, { size: 10 });
    text(money(item.line_total), cols.total, { size: 10 });
    y = rowTop - Math.max(descLines.length, 1) * 13 - 4;
  }

  if (lineItems.length === 0) {
    line('No line items.', { size: 10, color: GREY });
  }

  spacer(6);
  rule();
  spacer(10);

  // --- Totals ---
  newPageIfNeeded(56);
  text('Subtotal (excl. VAT):', cols.vat - 90, { size: 10, color: GREY });
  text(`AED ${money(invoice.subtotal)}`, cols.total, { size: 10 });
  y -= 15;
  text(`VAT (${vatPercent}):`, cols.vat - 90, { size: 10, color: GREY });
  text(`AED ${money(invoice.vat_amount)}`, cols.total, { size: 10 });
  y -= 15;
  text('Total (incl. VAT):', cols.vat - 90, { size: 12, useFont: bold });
  text(`AED ${money(invoice.total)}`, cols.total, { size: 12, useFont: bold });

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
    pg.drawText(footerClinicLine, {
      x: (PAGE_WIDTH - footerW1) / 2,
      y: 30,
      size: 8,
      font,
      color: GREY,
    });
    const footerLine2 = `Page ${i + 1} of ${pages.length}  ·  This is a computer-generated tax invoice.`;
    const footerW2 = font.widthOfTextAtSize(footerLine2, 7.5);
    pg.drawText(footerLine2, {
      x: (PAGE_WIDTH - footerW2) / 2,
      y: 18,
      size: 7.5,
      font,
      color: GREY,
    });
  }

  return pdfDoc.save();
}
