// lib/shiftTallyPdf.js
// Server-side only. Builds a printable Shift Tally report — the same
// data as the Shift Tally page's payment log and per-method totals, laid
// out as a one-page-per-shift report reception can print and keep
// alongside the physical till count. Same pdf-lib conventions and visual
// identity as lib/statementOfAccountsPdf.js (own copy of the header/
// footer/watermark helpers — see that file's note on why pdf-lib, and the
// pattern this codebase follows of one self-contained builder per
// document type rather than a shared base).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'fs/promises';
import path from 'path';
import { sanitizeForFont } from '@/lib/pdfTextSafety';

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const PINK = rgb(0.902, 0.094, 0.427); // #E6186D
const INK = rgb(0.125, 0.125, 0.125);
const GREY = rgb(0.4, 0.4, 0.4);
const LIGHT_RULE = rgb(0.85, 0.85, 0.85);

const TAGLINE = 'Kind, caring, and compassionate veterinary care';

const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  payment_link: 'Payment Link',
};

function money(n) {
  return Number(n || 0).toFixed(2);
}

function invoiceLabel(invoice) {
  return invoice?.invoice_number ? `INV-${String(invoice.invoice_number).padStart(6, '0')}` : '—';
}

async function loadLogoBytes() {
  try {
    return await readFile(path.join(process.cwd(), 'public', 'logo.png'));
  } catch {
    return null;
  }
}

export async function buildShiftTallyPdf({ date, shift, cutoff, summary, clinic }) {
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
      text('Shift Tally (continued)', MARGIN, { size: 9, color: GREY });
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

  // --- Header: logo + clinic identity on the left, report meta on the right ---
  const headerTop = y;
  const logoW = 46;
  const logoH = logoImage ? logoW * logoRatio : 0;
  const textX = logoImage ? MARGIN + logoW + 14 : MARGIN;

  if (logoImage) {
    page.drawImage(logoImage, { x: MARGIN, y: headerTop - logoH, width: logoW, height: logoH });
  }

  const rightEdge = PAGE_WIDTH - MARGIN;
  const shiftLabel = shift === 'morning' ? 'Morning Shift' : 'Afternoon Shift';
  rightText('SHIFT TALLY', rightEdge, { useFont: bold, size: 14, color: PINK });
  y -= 18;
  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString('en-AE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  rightText(`${dateLabel} — ${shiftLabel}`, rightEdge, { useFont: font, size: 9, color: GREY });
  y -= 12;
  rightText(`Cutoff: ${cutoff}`, rightEdge, { useFont: font, size: 8.5, color: GREY });
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
  rule();
  spacer(10);

  // --- Summary box: total collected, excl-VAT/VAT split, per-method totals ---
  newPageIfNeeded(60);
  const summaryColW = (PAGE_WIDTH - MARGIN * 2) / 3;
  const summaryTop = y;
  text('Total Collected', MARGIN, { size: 8.5, color: GREY });
  text('Excl. VAT', MARGIN + summaryColW, { size: 8.5, color: GREY });
  text('VAT (5%)', MARGIN + summaryColW * 2, { size: 8.5, color: GREY });
  y -= 15;
  text(`AED ${money(summary.total)}`, MARGIN, { size: 13, useFont: bold });
  text(`AED ${money(summary.vat.excl_vat)}`, MARGIN + summaryColW, { size: 13, useFont: bold });
  text(`AED ${money(summary.vat.vat_amount)}`, MARGIN + summaryColW * 2, { size: 13, useFont: bold });
  y -= 12;
  text(`${summary.count} payment${summary.count === 1 ? '' : 's'}`, MARGIN, { size: 8.5, color: GREY });
  y = summaryTop - 34;

  spacer(6);
  rule();
  spacer(10);

  newPageIfNeeded(30);
  text('By Payment Method', MARGIN, { size: 9, useFont: bold, color: GREY });
  y -= 15;
  const methodEntries = Object.entries(summary.totals_by_method).filter(([, m]) => m.count > 0);
  if (methodEntries.length === 0) {
    line('No payments logged in this window.', { size: 9.5, color: GREY });
  } else {
    const methodColW = (PAGE_WIDTH - MARGIN * 2) / methodEntries.length;
    methodEntries.forEach(([method, m], i) => {
      text(PAYMENT_METHOD_LABELS[method] || method, MARGIN + methodColW * i, { size: 8.5, color: GREY });
    });
    y -= 13;
    methodEntries.forEach(([, m], i) => {
      text(`AED ${money(m.total)} (${m.count})`, MARGIN + methodColW * i, { size: 10.5, useFont: bold });
    });
    y -= 16;
  }

  spacer(6);
  rule();
  spacer(10);

  // --- Payment log table ---
  const cols = {
    time: MARGIN,
    invoice: MARGIN + 42,
    client: MARGIN + 110,
    exclVat: MARGIN + 260,
    vat: MARGIN + 320,
    total: MARGIN + 370,
    method: MARGIN + 425,
    by: MARGIN + 490,
  };

  newPageIfNeeded(16);
  text('Time', cols.time, { size: 8, useFont: bold, color: GREY });
  text('Invoice', cols.invoice, { size: 8, useFont: bold, color: GREY });
  text('Client', cols.client, { size: 8, useFont: bold, color: GREY });
  text('Excl. VAT', cols.exclVat, { size: 8, useFont: bold, color: GREY });
  text('VAT', cols.vat, { size: 8, useFont: bold, color: GREY });
  text('Total', cols.total, { size: 8, useFont: bold, color: GREY });
  text('Method', cols.method, { size: 8, useFont: bold, color: GREY });
  text('By', cols.by, { size: 8, useFont: bold, color: GREY });
  y -= 14;
  rule();

  if (summary.payments.length === 0) {
    line('No payments logged in this window.', { size: 9.5, color: GREY });
  }

  for (const p of summary.payments) {
    newPageIfNeeded(14);
    const clientBits = [
      p.invoices?.clients?.full_name || '—',
      p.invoices?.clients?.client_number ? `#${p.invoices.clients.client_number}` : null,
    ].filter(Boolean);
    text(new Date(p.paid_at).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' }), cols.time, { size: 8.5 });
    text(invoiceLabel(p.invoices), cols.invoice, { size: 8.5 });
    text(clientBits.join(' '), cols.client, { size: 8.5 });
    text(money(p.excl_vat), cols.exclVat, { size: 8.5 });
    text(money(p.vat_amount), cols.vat, { size: 8.5 });
    text(money(p.total), cols.total, { size: 8.5, useFont: bold });
    text(PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method, cols.method, { size: 8.5 });
    text(p.staff?.full_name || '—', cols.by, { size: 8.5 });
    y -= 13;
  }

  spacer(6);
  rule();
  spacer(10);

  newPageIfNeeded(20);
  rightText('Total:', cols.total - 10, { size: 12, useFont: bold });
  text(`AED ${money(summary.total)}`, cols.total, { size: 12, useFont: bold });

  // --- Sign-off block: what a printed till-reconciliation slip actually needs ---
  newPageIfNeeded(60);
  spacer(20);
  const signColW = (PAGE_WIDTH - MARGIN * 2) / 2;
  const signY = y;
  page.drawLine({ start: { x: MARGIN, y: signY }, end: { x: MARGIN + signColW - 20, y: signY }, thickness: 1, color: LIGHT_RULE });
  page.drawLine({ start: { x: MARGIN + signColW, y: signY }, end: { x: PAGE_WIDTH - MARGIN, y: signY }, thickness: 1, color: LIGHT_RULE });
  y -= 12;
  text('Counted by (signature)', MARGIN, { size: 8, color: GREY });
  text('Verified by (signature)', MARGIN + signColW, { size: 8, color: GREY });

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
    const footerLine2 = `Page ${i + 1} of ${pages.length}  ·  This is a computer-generated shift tally report.`;
    const footerW2 = font.widthOfTextAtSize(footerLine2, 7.5);
    pg.drawText(footerLine2, { x: (PAGE_WIDTH - footerW2) / 2, y: 18, size: 7.5, font, color: GREY });
  }

  return pdfDoc.save();
}
