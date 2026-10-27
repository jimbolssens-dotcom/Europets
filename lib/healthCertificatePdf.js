// lib/healthCertificatePdf.js
// Server-side only. An export health certificate (migration 231) as one A4
// PDF, from what was saved when it was issued (health_certificates.data,
// lib/healthCertificate.js), so a reprint shows exactly what was certified.
// English only. Numbered sections like the official models, a signature
// line and an empty box for the clinic stamp. Same pdf-lib approach and
// look as the other clinic PDFs (lib/patientHistoryPdf.js).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'fs/promises';
import path from 'path';
import { sanitizeForFont } from '@/lib/pdfTextSafety';

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const PINK = rgb(0.902, 0.094, 0.427); // #E6186D
const INK = rgb(0.125, 0.125, 0.125);
const GREY = rgb(0.4, 0.4, 0.4);
const RULE = rgb(0.8, 0.8, 0.8);

async function loadLogoBytes() {
  try {
    return await readFile(path.join(process.cwd(), 'public', 'logo.png'));
  } catch {
    return null;
  }
}

function day(value) {
  if (!value) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' });
}

export async function buildHealthCertificatePdf({ certificateNumber, data }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  pdfDoc.setTitle(`Health certificate ${certificateNumber}: ${data.animal?.name || ''}`);

  const logoBytes = await loadLogoBytes();
  const logo = logoBytes ? await pdfDoc.embedPng(logoBytes) : null;

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const W = PAGE_WIDTH - 2 * MARGIN;
  let y = PAGE_HEIGHT - MARGIN;

  const safe = (f, t) => sanitizeForFont(f, t ?? '');
  const text = (t, x, yy, { size = 9.5, f = font, color = INK } = {}) => page.drawText(safe(f, t), { x, y: yy, size, font: f, color });

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

  function para(t, { x = MARGIN, width = W, size = 9.5, f = font, gap = 12.5, color = INK } = {}) {
    for (const line of wrap(t, f, size, width)) {
      text(line, x, y, { size, f, color });
      y -= gap;
    }
  }

  function section(n, title) {
    y -= 7;
    page.drawRectangle({ x: MARGIN, y: y - 4, width: W, height: 15, color: rgb(0.99, 0.93, 0.96) });
    text(`${n}. ${title}`, MARGIN + 5, y, { size: 9.5, f: bold, color: PINK });
    y -= 17;
  }

  // Label/value pairs in two columns.
  function grid(pairs) {
    const colW = W / 2;
    for (let i = 0; i < pairs.length; i += 2) {
      let rowBottom = y;
      for (let c = 0; c < 2; c++) {
        const p = pairs[i + c];
        if (!p) continue;
        const x = MARGIN + 5 + c * colW;
        // A long label wraps in its own column rather than running into the value.
        let ly = y;
        for (const line of wrap(p[0], bold, 8, 88)) {
          text(line, x, ly, { size: 8, f: bold, color: GREY });
          ly -= 10;
        }
        rowBottom = Math.min(rowBottom, ly - 2);
        let yy = y;
        for (const line of wrap(p[1] || '-', font, 9.5, colW - 105)) {
          text(line, x + 95, yy, { size: 9.5 });
          yy -= 12;
        }
        rowBottom = Math.min(rowBottom, yy);
      }
      y = rowBottom - 2;
    }
  }

  // A small table: columns [{ label, width }], rows of strings.
  function table(cols, rows) {
    let x = MARGIN + 5;
    for (const c of cols) {
      text(c.label, x, y, { size: 8, f: bold, color: GREY });
      x += c.width;
    }
    y -= 4;
    page.drawLine({ start: { x: MARGIN + 5, y }, end: { x: MARGIN + W - 5, y }, thickness: 0.6, color: RULE });
    y -= 11;
    if (!rows.length) {
      text('None on file', MARGIN + 5, y, { size: 9.5, color: GREY });
      y -= 13;
      return;
    }
    for (const r of rows) {
      let xx = MARGIN + 5;
      let bottom = y;
      r.forEach((cell, i) => {
        let yy = y;
        for (const line of wrap(cell || '-', font, 9.5, cols[i].width - 6)) {
          text(line, xx, yy, { size: 9.5 });
          yy -= 12;
        }
        bottom = Math.min(bottom, yy);
        xx += cols[i].width;
      });
      y = bottom - 1;
    }
  }

  // --- Header ---
  const top = y;
  const logoW = 52;
  const logoH = logo ? (logoW * logo.height) / logo.width : 0;
  if (logo) page.drawImage(logo, { x: MARGIN, y: top - logoH + 6, width: logoW, height: logoH });
  const c = data.clinic || {};
  const hx = MARGIN + (logo ? logoW + 12 : 0);
  text(c.name, hx, y, { size: 13, f: bold, color: PINK });
  y -= 13;
  for (const line of [c.address, [c.phone && `Tel ${c.phone}`, c.email].filter(Boolean).join('  ·  ')].filter(Boolean)) {
    for (const l of wrap(line, font, 8.5, 260)) {
      text(l, hx, y, { size: 8.5, color: GREY });
      y -= 10.5;
    }
  }
  // Number and date, top right.
  const rx = PAGE_WIDTH - MARGIN;
  const right = (t, yy, opts) => text(t, rx - (opts?.f || font).widthOfTextAtSize(safe(opts?.f || font, t), opts?.size || 9), yy, opts);
  right(`Certificate no. ${certificateNumber}`, top, { size: 9.5, f: bold });
  right(`Issued ${day(data.issued_at)}`, top - 12, { size: 9, color: GREY });
  y = Math.min(y, top - logoH) - 10;

  y -= 4;
  text('VETERINARY HEALTH CERTIFICATE', MARGIN, y, { size: 16, f: bold });
  y -= 15;
  text('for the international movement of a dog or cat', MARGIN, y, { size: 9.5, color: GREY });
  y -= 12;

  // --- 1. Owner ---
  section(1, 'Owner');
  grid([
    ['Name', data.owner?.name],
    ['Phone', data.owner?.phone],
    ['Address', data.owner?.address],
  ]);

  // --- 2. Animal ---
  const a = data.animal || {};
  section(2, 'Description of the animal');
  grid([
    ['Name', a.name],
    ['Species', a.species],
    ['Breed', a.breed],
    ['Sex', a.sex],
    ['Date of birth', a.date_of_birth ? `${day(a.date_of_birth)}${a.date_of_birth_estimated ? ' (estimated)' : ''}${a.age ? `, ${a.age}` : ''}` : ''],
    ['Colour / markings', a.colour],
    ['Weight', a.weight_kg != null ? `${a.weight_kg} kg` : ''],
  ]);

  // --- 3. Identification ---
  const m = data.microchip || {};
  section(3, 'Identification');
  grid([
    ['Microchip number', m.number],
    ['Standard', m.number ? (m.iso ? 'ISO 11784/11785' : 'Not ISO 11784/11785') : ''],
    ['Date implanted', day(m.implanted_at)],
    ['Location', m.location],
  ]);

  // --- 4. Rabies ---
  const vaccines = data.vaccines || [];
  const rabies = vaccines.filter((v) => v.kind === 'rabies');
  section(4, 'Rabies vaccination');
  table(
    [
      { label: 'Vaccine (manufacturer)', width: 170 },
      { label: 'Batch', width: 95 },
      { label: 'Date of vaccination', width: 110 },
      { label: 'Valid until', width: 110 },
    ],
    rabies.map((v) => [v.product, v.batch, day(v.date_given), day(v.valid_until)])
  );

  // --- 5. Other vaccinations ---
  section(5, 'Other vaccinations');
  table(
    [
      { label: 'Against', width: 150 },
      { label: 'Vaccine (manufacturer)', width: 150 },
      { label: 'Batch', width: 75 },
      { label: 'Date', width: 70 },
      { label: 'Valid until', width: 70 },
    ],
    vaccines.filter((v) => v.kind !== 'rabies').map((v) => [v.disease, v.product, v.batch, day(v.date_given), day(v.valid_until)])
  );

  // --- 6. Parasites ---
  const ps = data.parasites || {};
  section(6, 'Parasite treatment');
  grid([
    ['Internal (worms)', [ps.internal?.product, day(ps.internal?.date)].filter(Boolean).join(', ')],
    ['External (fleas, ticks)', [ps.external?.product, day(ps.external?.date)].filter(Boolean).join(', ')],
  ]);

  // --- 7. Travel ---
  const t = data.travel || {};
  section(7, 'Travel');
  grid([
    ['Destination', t.destination],
    ['Date of travel', day(t.date)],
    ['Countries visited, last 6 months', t.visited],
  ]);

  // --- 8. Certification ---
  section(8, 'Clinical examination and certification');
  para(data.statement, { x: MARGIN + 5, width: W - 10, size: 9.5, gap: 12.5 });
  if (data.remarks) {
    y -= 2;
    para(`Remarks: ${data.remarks}`, { x: MARGIN + 5, width: W - 10, size: 9.5, gap: 12.5 });
  }
  y -= 8;
  grid([
    ['Date of examination', day(data.exam_date)],
    ['Veterinarian', data.vet?.name],
    ['Licence number', data.vet?.licence_number],
  ]);

  // Signature line and stamp box, side by side.
  y -= 48;
  const sigY = Math.max(y, MARGIN + 70);
  page.drawLine({ start: { x: MARGIN + 5, y: sigY }, end: { x: MARGIN + 230, y: sigY }, thickness: 0.8, color: INK });
  text('Signature of the veterinarian', MARGIN + 5, sigY - 11, { size: 8, color: GREY });
  page.drawRectangle({ x: MARGIN + W - 170, y: sigY - 14, width: 165, height: 62, borderColor: RULE, borderWidth: 0.8 });
  text('Clinic stamp', MARGIN + W - 165, sigY - 9, { size: 8, color: GREY });

  // --- Footer ---
  const note =
    'Issued by the veterinary clinic named above. It supports, and does not replace, an export certificate or permit issued by the competent authority (in the UAE, the Ministry of Climate Change and Environment). Destination requirements differ: check them before travel.';
  let fy = MARGIN - 6;
  const footLines = wrap(note, font, 7.5, W);
  fy += footLines.length * 9;
  for (const l of footLines) {
    text(l, MARGIN, fy, { size: 7.5, color: GREY });
    fy -= 9;
  }

  return pdfDoc.save();
}
