// lib/prescriptionPdf.js
// A veterinary prescription for an outside pharmacy (migration 249), one A4
// page per prescription (a second page only for a very long one): clinic
// letterhead, owner and patient, each medicine with how much to supply and
// how to give it, and the prescribing vet's name, licence number,
// signature and stamp (migration 251: uploaded on the Staff page, else a
// blank line and an empty box to sign and stamp by hand). Built server-side by
// GET /api/prescriptions/:id/pdf, in the same style as the health
// certificate (lib/healthCertificatePdf.js).

import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { readFile } from 'fs/promises';
import path from 'path';
import { sanitizeForFont } from '@/lib/pdfTextSafety';
import { RX_VALID_DAYS, rxAge, rxNumber } from '@/lib/prescriptions';
import { fitInBox } from '@/lib/signatureImages';

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 46;
const PINK = rgb(0.902, 0.094, 0.427); // #E6186D
const INK = rgb(0.125, 0.125, 0.125);
const GREY = rgb(0.42, 0.42, 0.42);
const RULE = rgb(0.82, 0.82, 0.82);
const TINT = rgb(0.99, 0.93, 0.96);

async function loadLogoBytes() {
  try {
    return await readFile(path.join(process.cwd(), 'public', 'logo.png'));
  } catch {
    return null;
  }
}

function day(value) {
  const d = new Date(value);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' });
}

export async function buildPrescriptionPdf({ rx, patient, client, vet, clinic, signaturePng = null, stampPng = null }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  pdfDoc.setTitle(`Prescription ${rxNumber(rx.rx_number)}: ${patient?.name || ''}`);
  const logoBytes = await loadLogoBytes();
  const logo = logoBytes ? await pdfDoc.embedPng(logoBytes) : null;
  const embed = async (bytes) => {
    try {
      return bytes ? await pdfDoc.embedPng(bytes) : null;
    } catch {
      return null;
    }
  };
  const signature = await embed(signaturePng);
  const stamp = await embed(stampPng);

  const W = PAGE_WIDTH - 2 * MARGIN;
  let page;
  let y;
  const safe = (f, t) => sanitizeForFont(f, t ?? '');
  const text = (t, x, yy, { size = 10, f = font, color = INK } = {}) => page.drawText(safe(f, t), { x, y: yy, size, font: f, color });
  const rightText = (t, xRight, yy, opts = {}) => {
    const f = opts.f || font;
    const size = opts.size || 10;
    text(t, xRight - f.widthOfTextAtSize(safe(f, t), size), yy, opts);
  };
  function wrap(t, f, size, maxWidth) {
    const lines = [];
    for (const para of String(t ?? '').split(/\n/)) {
      let cur = '';
      for (const w of safe(f, para).split(/\s+/).filter(Boolean)) {
        const test = cur ? `${cur} ${w}` : w;
        if (cur && f.widthOfTextAtSize(test, size) > maxWidth) {
          lines.push(cur);
          cur = w;
        } else cur = test;
      }
      lines.push(cur);
    }
    return lines;
  }

  function newPage() {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
    // Letterhead.
    if (logo) {
      const h = 46;
      const w = (logo.width / logo.height) * h;
      page.drawImage(logo, { x: MARGIN, y: y - h + 6, width: w, height: h });
    }
    rightText(clinic?.legal_name || 'Europets Veterinary Clinic', MARGIN + W, y, { size: 12, f: bold });
    let hy = y - 14;
    for (const line of [clinic?.address, [clinic?.phone, clinic?.phone2].filter(Boolean).join('  ·  '), clinic?.email].filter(Boolean)) {
      for (const l of wrap(line, font, 8.5, 260)) {
        rightText(l, MARGIN + W, hy, { size: 8.5, color: GREY });
        hy -= 11;
      }
    }
    y = Math.min(y - 58, hy - 8);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + W, y }, thickness: 1.2, color: PINK });
    y -= 26;
  }

  function ensure(space) {
    if (y - space < MARGIN + 120) newPage();
  }

  newPage();
  text('VETERINARY PRESCRIPTION', MARGIN, y, { size: 16, f: bold, color: PINK });
  rightText(rxNumber(rx.rx_number), MARGIN + W, y + 2, { size: 11, f: bold });
  rightText(`Date: ${day(rx.created_at)}`, MARGIN + W, y - 12, { size: 9.5, color: GREY });
  y -= 30;

  // Owner and patient, side by side.
  const colW = W / 2 - 6;
  const boxTop = y + 12;
  const left = [
    ['Owner', client?.full_name || '-'],
    ['Client no.', client?.client_number ? `#${client.client_number}` : '-'],
    ['Phone', client?.phone || '-'],
  ];
  const sexLabels = { male: 'Male', female: 'Female', male_neutered: 'Male (neutered)', female_spayed: 'Female (spayed)' };
  const right = [
    ['Patient', `${patient?.name || '-'}${patient?.patient_number ? `  (#${patient.patient_number})` : ''}`],
    ['Species', [patient?.species, patient?.breed].filter(Boolean).join(', ') || '-'],
    ['Sex / age', [sexLabels[patient?.sex] || '', rxAge(patient?.date_of_birth)].filter(Boolean).join(', ') || '-'],
    ['Weight', rx.weight_kg ? `${rx.weight_kg} kg` : patient?.current_weight_kg ? `${patient.current_weight_kg} kg` : '-'],
    ['Microchip', patient?.microchip_number || '-'],
  ];
  const rows = Math.max(left.length, right.length);
  const boxH = rows * 14 + 14;
  page.drawRectangle({ x: MARGIN, y: boxTop - boxH, width: W, height: boxH, color: TINT });
  for (let i = 0; i < rows; i++) {
    const yy = boxTop - 16 - i * 14;
    if (left[i]) {
      text(left[i][0], MARGIN + 10, yy, { size: 8.5, f: bold, color: GREY });
      text(left[i][1], MARGIN + 72, yy, { size: 10 });
    }
    if (right[i]) {
      text(right[i][0], MARGIN + colW + 18, yy, { size: 8.5, f: bold, color: GREY });
      text(right[i][1], MARGIN + colW + 80, yy, { size: 10 });
    }
  }
  y = boxTop - boxH - 26;

  // The medicines.
  text('Rx', MARGIN, y, { size: 20, f: bold, color: PINK });
  y -= 24;
  (rx.items || []).forEach((item, i) => {
    const dirLines = wrap(item.directions, font, 10.5, W - 30);
    ensure(44 + dirLines.length * 14);
    text(`${i + 1}.`, MARGIN, y, { size: 11, f: bold });
    const title = [item.name, item.strength].filter(Boolean).join('  ');
    for (const l of wrap(title, bold, 11.5, W - 30)) {
      text(l, MARGIN + 20, y, { size: 11.5, f: bold });
      y -= 15;
    }
    const meta = [item.quantity ? `Supply: ${item.quantity}` : '', item.duration ? `Duration: ${item.duration}` : ''].filter(Boolean).join('     ');
    if (meta) {
      text(meta, MARGIN + 20, y, { size: 10, color: GREY });
      y -= 14;
    }
    for (const l of dirLines) {
      text(l, MARGIN + 20, y, { size: 10.5 });
      y -= 14;
    }
    y -= 8;
    page.drawLine({ start: { x: MARGIN + 20, y: y + 4 }, end: { x: MARGIN + W, y: y + 4 }, thickness: 0.5, color: RULE });
    y -= 6;
  });

  if (rx.notes) {
    y -= 6;
    const noteLines = wrap(rx.notes, font, 10, W);
    ensure(20 + noteLines.length * 13);
    text('Notes', MARGIN, y, { size: 9, f: bold, color: GREY });
    y -= 13;
    for (const l of noteLines) {
      text(l, MARGIN, y, { size: 10 });
      y -= 13;
    }
    y -= 6;
  }

  // Prescriber, signature and stamp, at the foot of the last page.
  const footTop = Math.min(y - 10, MARGIN + 150);
  if (footTop < MARGIN + 100) newPage();
  const fy = Math.min(y - 10, MARGIN + 150);
  text('Prescribing veterinarian', MARGIN, fy, { size: 8.5, f: bold, color: GREY });
  text(vet?.full_name || '', MARGIN, fy - 15, { size: 11.5, f: bold });
  text(`Licence no.: ${vet?.licence_number || '______________________'}`, MARGIN, fy - 31, { size: 10 });
  if (signature) {
    const { width, height } = fitInBox(signature.width, signature.height, 200, 40);
    page.drawImage(signature, { x: MARGIN + 4, y: fy - 68, width, height });
  }
  page.drawLine({ start: { x: MARGIN, y: fy - 70 }, end: { x: MARGIN + 210, y: fy - 70 }, thickness: 0.8, color: INK });
  text('Signature', MARGIN, fy - 82, { size: 8.5, color: GREY });
  if (stamp) {
    // The vet's own stamp, a touch tilted as a real one lands.
    const { width, height } = fitInBox(stamp.width, stamp.height, 200, 80);
    page.drawImage(stamp, { x: MARGIN + W - width - 6, y: fy - 80, width, height, rotate: degrees(2), opacity: 0.92 });
  } else {
    const stampX = MARGIN + W - 150;
    page.drawRectangle({ x: stampX, y: fy - 86, width: 150, height: 92, borderColor: RULE, borderWidth: 0.8, borderDashArray: [3, 3] });
    text('Clinic stamp', stampX + 8, fy - 2 - 10, { size: 8.5, color: GREY });
  }

  const foot = `Valid for ${RX_VALID_DAYS} days from the date of issue. For veterinary use only: for the animal named above, not for human use.`;
  let ly = MARGIN + 6;
  for (const l of wrap(foot, font, 8, W).reverse()) {
    text(l, MARGIN, ly, { size: 8, color: GREY });
    ly += 10;
  }

  return pdfDoc.save();
}
