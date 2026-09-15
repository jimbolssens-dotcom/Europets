// lib/statementOfAccountsPdf.js
// Server-side only. Builds a client's Statement of Account: every
// non-void invoice raised against them and every payment received,
// interleaved into one chronological ledger with a running balance, plus
// a summary of total invoiced/paid/outstanding at a glance. Same pdf-lib
// conventions and visual identity as lib/taxInvoicePdf.js (own copy of the
// header/footer/watermark helpers — see that file's note on why pdf-lib,
// and the pattern this codebase follows of one self-contained builder per
// document type rather than a shared base).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'fs/promises';
import path from 'path';
import { balanceDue } from '@/lib/paymentReminders';
import { sanitizeForFont } from '@/lib/pdfTextSafety';

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const PINK = rgb(0.902, 0.094, 0.427); // #E6186D
const INK = rgb(0.125, 0.125, 0.125);
const GREY = rgb(0.4, 0.4, 0.4);
const LIGHT_RULE = rgb(0.85, 0.85, 0.85);
const DEBIT_RED = rgb(0.63, 0.07, 0.19);

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
  return invoice.invoice_number ? `INV-${String(invoice.invoice_number).padStart(6, '0')}` : (invoice.id || '').slice(0, 8);
}

async function loadLogoBytes() {
  try {
    return await readFile(path.join(process.cwd(), 'public', 'logo.png'));
  } catch {
    return null;
  }
}

// Interleaves every non-void invoice (a charge, dated when it was raised)
// with every payment against it (a credit, dated when it was received),
// plus an opening "brought forward" entry for any legacy pre-migration
// balance, into one chronological ledger with a running balance — the
// same total math as lib/paymentReminders.js#balanceDue, just itemized
// entry by entry instead of only the current snapshot.
function buildLedger({ invoices, paymentsByInvoiceId, legacyBalance }) {
  const entries = [];

  if (legacyBalance > 0) {
    entries.push({
      date: null, // sorts first — see the sort below
      description: 'Balance brought forward (previous system)',
      charge: legacyBalance,
      payment: 0,
    });
  }

  for (const invoice of invoices) {
    entries.push({
      date: invoice.created_at,
      description: `Invoice ${invoiceLabel(invoice)}`,
      charge: Number(invoice.total),
      payment: 0,
    });
    for (const payment of paymentsByInvoiceId.get(invoice.id) || []) {
      const methodLabel = PAYMENT_METHOD_LABELS[payment.payment_method] || payment.payment_method;
      entries.push({
        date: payment.paid_at,
        description: `Payment received — ${methodLabel} (${invoiceLabel(invoice)})`,
        charge: 0,
        payment: Number(payment.amount),
      });
    }
  }

  entries.sort((a, b) => {
    if (a.date === null) return -1;
    if (b.date === null) return 1;
    return new Date(a.date) - new Date(b.date);
  });

  let balance = 0;
  for (const entry of entries) {
    balance += entry.charge - entry.payment;
    entry.balance = balance;
  }
  return entries;
}

export async function buildStatementOfAccountsPdf({ client, invoices, paymentsByInvoiceId, clinic }) {
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
      text('Statement of Account (continued)', MARGIN, { size: 9, color: GREY });
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

  // --- Header: logo + clinic identity on the left, statement meta on the right ---
  const headerTop = y;
  const logoW = 46;
  const logoH = logoImage ? logoW * logoRatio : 0;
  const textX = logoImage ? MARGIN + logoW + 14 : MARGIN;

  if (logoImage) {
    page.drawImage(logoImage, { x: MARGIN, y: headerTop - logoH, width: logoW, height: logoH });
  }

  const rightEdge = PAGE_WIDTH - MARGIN;
  rightText('STATEMENT OF ACCOUNT', rightEdge, { useFont: bold, size: 14, color: PINK });
  y -= 18;
  rightText(`As of ${new Date().toLocaleDateString('en-AE')}`, rightEdge, { useFont: font, size: 9, color: GREY });
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

  // --- Client block ---
  const clientHeaderBits = [client?.full_name || '—', client?.client_number ? `(Client #${client.client_number})` : null].filter(Boolean);
  line(clientHeaderBits.join('  '), { size: 12, useFont: bold, gap: 15 });
  const clientContactBits = [client?.phone ? `Phone: ${client.phone}` : null, client?.email ? `Email: ${client.email}` : null].filter(Boolean);
  if (clientContactBits.length) line(clientContactBits.join('   ·   '), { size: 9.5, gap: 13 });

  spacer(6);
  rule();
  spacer(10);

  // --- Summary box ---
  const legacyBalance = Number(client?.legacy_outstanding_balance || 0);
  const totalInvoiced = invoices.reduce((sum, inv) => sum + Number(inv.total), 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0);
  const totalOutstanding = invoices.reduce((sum, inv) => sum + balanceDue(inv), 0) + legacyBalance;

  newPageIfNeeded(50);
  const summaryColW = (PAGE_WIDTH - MARGIN * 2) / 3;
  const summaryTop = y;
  text('Total Invoiced', MARGIN, { size: 8.5, color: GREY });
  text('Total Paid', MARGIN + summaryColW, { size: 8.5, color: GREY });
  text('Total Outstanding', MARGIN + summaryColW * 2, { size: 8.5, color: GREY });
  y -= 15;
  text(`AED ${money(totalInvoiced)}`, MARGIN, { size: 13, useFont: bold });
  text(`AED ${money(totalPaid)}`, MARGIN + summaryColW, { size: 13, useFont: bold });
  text(`AED ${money(totalOutstanding)}`, MARGIN + summaryColW * 2, { size: 13, useFont: bold, color: totalOutstanding > 0 ? DEBIT_RED : INK });
  y = summaryTop - 24;

  spacer(6);
  rule();
  spacer(10);

  // --- Ledger table ---
  const cols = { date: MARGIN, desc: MARGIN + 70, charge: MARGIN + 300, payment: MARGIN + 370, balance: MARGIN + 440 };

  newPageIfNeeded(16);
  text('Date', cols.date, { size: 9, useFont: bold, color: GREY });
  text('Description', cols.desc, { size: 9, useFont: bold, color: GREY });
  text('Charge', cols.charge, { size: 9, useFont: bold, color: GREY });
  text('Payment', cols.payment, { size: 9, useFont: bold, color: GREY });
  text('Balance', cols.balance, { size: 9, useFont: bold, color: GREY });
  y -= 16;
  rule();

  const ledger = buildLedger({ invoices, paymentsByInvoiceId, legacyBalance });

  if (ledger.length === 0) {
    line('No invoices or payments on record.', { size: 10, color: GREY });
  }

  for (const entry of ledger) {
    newPageIfNeeded(15);
    text(entry.date ? new Date(entry.date).toLocaleDateString('en-AE') : 'Opening', cols.date, { size: 9.5 });
    text(entry.description, cols.desc, { size: 9.5 });
    if (entry.charge > 0) text(money(entry.charge), cols.charge, { size: 9.5 });
    if (entry.payment > 0) text(money(entry.payment), cols.payment, { size: 9.5, color: DEBIT_RED });
    text(money(entry.balance), cols.balance, { size: 9.5, useFont: bold });
    y -= 15;
  }

  spacer(6);
  rule();
  spacer(10);

  newPageIfNeeded(20);
  rightText('Balance Outstanding:', cols.balance - 10, { size: 12, useFont: bold });
  text(`AED ${money(totalOutstanding)}`, cols.balance, { size: 12, useFont: bold, color: totalOutstanding > 0 ? DEBIT_RED : INK });

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
    const footerLine2 = `Page ${i + 1} of ${pages.length}  ·  This is a computer-generated statement of account.`;
    const footerW2 = font.widthOfTextAtSize(footerLine2, 7.5);
    pg.drawText(footerLine2, { x: (PAGE_WIDTH - footerW2) / 2, y: 18, size: 7.5, font, color: GREY });
  }

  return pdfDoc.save();
}
