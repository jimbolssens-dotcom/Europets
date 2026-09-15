// lib/proformaQuotePdf.js
// Server-side only. Builds a Proforma Invoice (quotation) PDF for a
// patient — a price estimate for the client, clearly marked as NOT a tax
// invoice (no VAT-registered document, no accounting effect — see
// migrations/101_proforma_invoices.sql). Same pdf-lib conventions and
// visual identity as lib/taxInvoicePdf.js (own copy of the header/footer/
// watermark helpers — this codebase's pattern is one self-contained
// builder per document type rather than a shared base).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'fs/promises';
import path from 'path';
import { VAT_RATE } from '@/lib/invoicing';
import { sanitizeForFont } from '@/lib/pdfTextSafety';

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const PINK = rgb(0.902, 0.094, 0.427); // #E6186D
const INK = rgb(0.125, 0.125, 0.125);
const GREY = rgb(0.4, 0.4, 0.4);
const LIGHT_RULE = rgb(0.85, 0.85, 0.85);
const CATEGORY_BG = rgb(0.961, 0.961, 0.961);

const TAGLINE = 'Kind, caring, and compassionate veterinary care';

const PDF_CATEGORY_ORDER = ['service', 'test', 'product'];
const PDF_CATEGORY_LABELS = { service: 'Services', test: 'Diagnostics', product: 'Medications' };

function groupItemsForPdf(items) {
  const buckets = new Map();
  for (const item of items) {
    const mainCategory = item.goods_services?.main_category || null;
    if (!buckets.has(mainCategory)) buckets.set(mainCategory, []);
    buckets.get(mainCategory).push(item);
  }
  const ordered = [...PDF_CATEGORY_ORDER, null].filter((mc) => buckets.has(mc));
  return ordered.map((mc) => ({ mainCategory: mc, label: mc ? PDF_CATEGORY_LABELS[mc] : 'Other', items: buckets.get(mc) }));
}

function money(n) {
  return Number(n || 0).toFixed(2);
}

function wrapText(str, useFont, size, maxWidth) {
  const words = sanitizeForFont(useFont, str).split(/\s+/).filter(Boolean);
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
    return null;
  }
}

export async function buildProformaQuotePdf({ quote, items, clinic, client, patient }) {
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
      text('Quotation (continued)', MARGIN, { size: 9, color: GREY });
      y -= 20;
    }
  }

  function text(str, x, { size = 10, useFont = font, color = INK } = {}) {
    page.drawText(sanitizeForFont(useFont, str ?? ''), { x, y, size, font: useFont, color });
  }

  function rightText(str, rightEdge, { size = 10, useFont = bold, color = INK } = {}) {
    const safe = sanitizeForFont(useFont, str ?? '');
    const w = useFont.widthOfTextAtSize(safe, size);
    text(safe, rightEdge - w, { size, useFont, color });
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
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: LIGHT_RULE });
    y -= 12;
  }

  // --- Header ---
  const headerTop = y;
  const logoW = 46;
  const logoH = logoImage ? logoW * logoRatio : 0;
  const textX = logoImage ? MARGIN + logoW + 14 : MARGIN;

  if (logoImage) {
    page.drawImage(logoImage, { x: MARGIN, y: headerTop - logoH, width: logoW, height: logoH });
  }

  const rightEdge = PAGE_WIDTH - MARGIN;
  rightText('QUOTATION', rightEdge, { useFont: bold, size: 16, color: PINK });
  y -= 18;
  rightText(`Date: ${new Date(quote.created_at).toLocaleDateString('en-AE')}`, rightEdge, { useFont: font, size: 9, color: GREY });
  const rightColumnBottom = y - 12;

  y = headerTop;
  text(clinic?.legal_name || 'Europets Veterinary Clinic', textX, { useFont: bold, size: 14 });
  y -= 16;
  text(TAGLINE, textX, { useFont: italic, size: 9, color: PINK });
  y -= 12;
  const clinicContactBits = [clinic?.phone || null, clinic?.phone2 || null, clinic?.email || null].filter(Boolean);
  if (clinicContactBits.length) {
    text(clinicContactBits.join('  ·  '), textX, { size: 8.5, color: GREY });
    y -= 11;
  }

  y = Math.min(y, headerTop - logoH, rightColumnBottom) - 10;
  spacer(4);

  // Prominent disclaimer — a quotation must never be mistaken for a tax
  // invoice: no VAT is due on it, it isn't logged as revenue, and prices
  // are indicative only until an actual invoice is raised.
  newPageIfNeeded(16);
  page.drawRectangle({ x: MARGIN, y: y - 4, width: PAGE_WIDTH - MARGIN * 2, height: 16, color: rgb(1, 0.973, 0.882) });
  text('This is a quotation for your reference only — NOT a tax invoice. Prices are estimates and may change.', MARGIN + 4, {
    size: 8.5,
    useFont: italic,
    color: rgb(0.6, 0.42, 0),
  });
  y -= 20;

  rule();
  spacer(10);

  // --- Prepared For: client + patient ---
  text('Prepared For', MARGIN, { size: 9, useFont: bold, color: GREY });
  y -= 14;

  const clientHeaderBits = [client?.full_name || '—', client?.client_number ? `(Client #${client.client_number})` : null].filter(Boolean);
  line(clientHeaderBits.join('  '), { size: 11, useFont: bold, gap: 14 });

  const clientContactBits = [client?.phone ? `Phone: ${client.phone}` : null, client?.email ? `Email: ${client.email}` : null].filter(Boolean);
  if (clientContactBits.length) line(clientContactBits.join('   ·   '), { size: 9.5, gap: 13 });

  if (patient) {
    spacer(3);
    const patientHeaderBits = [`Patient: ${patient.name || '—'}`, patient.patient_number ? `(Patient #${patient.patient_number})` : null].filter(Boolean);
    line(patientHeaderBits.join('  '), { size: 10.5, useFont: bold, gap: 13 });
    if (patient.species) line(`Species: ${patient.species}`, { size: 9.5, color: GREY, gap: 13 });
  }

  spacer(6);
  rule();
  spacer(10);

  // --- Line items table ---
  const cols = { desc: MARGIN, qty: MARGIN + 260, unit: MARGIN + 310, vat: MARGIN + 390, total: MARGIN + 440 };

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

  function categoryHeader(label) {
    newPageIfNeeded(20);
    page.drawRectangle({ x: MARGIN, y: y - 4, width: PAGE_WIDTH - MARGIN * 2, height: 14, color: CATEGORY_BG });
    text(label.toUpperCase(), cols.desc + 2, { size: 8, useFont: bold, color: GREY });
    y -= 18;
  }

  const groups = groupItemsForPdf(items);
  for (const group of groups) {
    categoryHeader(group.label);
    for (const item of group.items) {
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
  }

  if (items.length === 0) {
    line('No items on this quote.', { size: 10, color: GREY });
  }

  spacer(6);
  rule();
  spacer(10);

  // --- Totals ---
  const subtotal = items.reduce((sum, item) => sum + Number(item.line_total), 0);
  const vatAmount = Math.round(subtotal * VAT_RATE * 100) / 100;
  const total = Math.round((subtotal + vatAmount) * 100) / 100;

  newPageIfNeeded(56);
  text('Subtotal (excl. VAT):', cols.vat - 90, { size: 10, color: GREY });
  text(`AED ${money(subtotal)}`, cols.total, { size: 10 });
  y -= 15;
  text(`VAT (${vatPercent}):`, cols.vat - 90, { size: 10, color: GREY });
  text(`AED ${money(vatAmount)}`, cols.total, { size: 10 });
  y -= 15;
  text('Estimated Total (incl. VAT):', cols.vat - 90, { size: 12, useFont: bold });
  text(`AED ${money(total)}`, cols.total, { size: 12, useFont: bold });

  spacer(20);
  line('Valid for 30 days from the date above. An official tax invoice is issued once treatment is confirmed.', {
    size: 8.5,
    useFont: italic,
    color: GREY,
    gap: 12,
  });

  // --- Watermark + footer on every page ---
  const pages = pdfDoc.getPages();
  const footerClinicLine = sanitizeForFont(font, [clinic?.legal_name || 'Europets Veterinary Clinic', TAGLINE].join('  —  '));

  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i];
    if (logoImage) {
      const wmW = 260;
      const wmH = wmW * logoRatio;
      pg.drawImage(logoImage, { x: (PAGE_WIDTH - wmW) / 2, y: (PAGE_HEIGHT - wmH) / 2, width: wmW, height: wmH, opacity: 0.06 });
    }
    pg.drawLine({ start: { x: MARGIN, y: 44 }, end: { x: PAGE_WIDTH - MARGIN, y: 44 }, thickness: 1, color: LIGHT_RULE });
    const footerW1 = font.widthOfTextAtSize(footerClinicLine, 8);
    pg.drawText(footerClinicLine, { x: (PAGE_WIDTH - footerW1) / 2, y: 30, size: 8, font, color: GREY });
    const footerLine2 = `Page ${i + 1} of ${pages.length}  ·  This is a quotation, not a tax invoice.`;
    const footerW2 = font.widthOfTextAtSize(footerLine2, 7.5);
    pg.drawText(footerLine2, { x: (PAGE_WIDTH - footerW2) / 2, y: 18, size: 7.5, font, color: GREY });
  }

  return pdfDoc.save();
}
