// lib/taxInvoicePdf.js
// Server-side only. Builds a UAE FTA-compliant Tax Invoice PDF: supplier
// (clinic) TRN and identity, recipient details, a sequential invoice
// number, per-line VAT rate, and the subtotal/VAT/total breakdown in AED.
// Uses pdf-lib (see hospitalizationSummaryPdf.js for why, over pdfkit).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { VAT_RATE } from '@/lib/invoicing';

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const PINK = rgb(0.902, 0.094, 0.427); // #E6186D
const INK = rgb(0.125, 0.125, 0.125);
const GREY = rgb(0.4, 0.4, 0.4);

function money(n) {
  return Number(n || 0).toFixed(2);
}

function invoiceNumberText(n) {
  return `INV-${String(n).padStart(6, '0')}`;
}

export async function buildTaxInvoicePdf({ invoice, lineItems, clinic, client }) {
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

  function text(str, x, { size = 10, useFont = font, color = INK } = {}) {
    page.drawText(String(str ?? ''), { x, y, size, font: useFont, color });
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
      color: rgb(0.85, 0.85, 0.85),
    });
    y -= 12;
  }

  // --- Header ---
  text('TAX INVOICE', MARGIN, { size: 20, useFont: bold, color: PINK });
  text(invoiceNumberText(invoice.invoice_number), PAGE_WIDTH - MARGIN - 150, { size: 12, useFont: bold });
  y -= 26;

  const issueDate = new Date(invoice.created_at).toLocaleDateString('en-AE');
  line(`Issue date: ${issueDate}`, { size: 10, color: GREY, gap: 13 });
  line(`Status: ${invoice.status}`, { size: 10, color: GREY, gap: 18 });

  rule();
  spacer(6);

  // --- Supplier / recipient side by side ---
  const colWidth = (PAGE_WIDTH - MARGIN * 2 - 20) / 2;
  const topY = y;

  text('Supplier', MARGIN, { size: 9, useFont: bold, color: GREY });
  text('Bill To', MARGIN + colWidth + 20, { size: 9, useFont: bold, color: GREY });
  y -= 14;

  const supplierLines = [
    clinic?.legal_name || 'Europets Veterinary Clinic',
    clinic?.trn ? `TRN: ${clinic.trn}` : null,
    clinic?.address || null,
    clinic?.phone || null,
    clinic?.email || null,
  ].filter(Boolean);

  const clientLines = [
    client?.full_name || '—',
    client?.trn ? `TRN: ${client.trn}` : null,
    client?.address || null,
    client?.phone || null,
  ].filter(Boolean);

  const rows = Math.max(supplierLines.length, clientLines.length);
  for (let i = 0; i < rows; i++) {
    newPageIfNeeded(13);
    if (supplierLines[i]) text(supplierLines[i], MARGIN, { size: 10 });
    if (clientLines[i]) text(clientLines[i], MARGIN + colWidth + 20, { size: 10 });
    y -= 13;
  }
  y = Math.min(y, topY - rows * 13 - 14);

  spacer(10);
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
  const totalsX = cols.vat;
  newPageIfNeeded(56);
  text('Subtotal (excl. VAT):', totalsX - 90, { size: 10, color: GREY });
  text(`AED ${money(invoice.subtotal)}`, cols.total, { size: 10 });
  y -= 15;
  text(`VAT (${vatPercent}):`, totalsX - 90, { size: 10, color: GREY });
  text(`AED ${money(invoice.vat_amount)}`, cols.total, { size: 10 });
  y -= 15;
  text('Total (incl. VAT):', totalsX - 90, { size: 12, useFont: bold });
  text(`AED ${money(invoice.total)}`, cols.total, { size: 12, useFont: bold });
  y -= 30;

  line('This is a computer-generated tax invoice.', { size: 8, color: GREY, gap: 11 });

  return pdfDoc.save();
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
