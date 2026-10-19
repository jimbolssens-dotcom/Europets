// lib/patientHistoryPdf.js
// Server-side only. A patient's full medical history as one PDF, for staff
// to send the owner (moving clinic, travel, insurance): the pet's details
// and microchip, every vaccination, records from other clinics marked to
// share with the owner, then every report and test on file, newest first:
// exactly what the Full Patient History page shows (lib/
// patientReportOverview.js). No invoices or prices.
//
// Same pdf-lib approach, header, watermark and footer as lib/
// consultReportPdf.js, so it looks like every other report the clinic sends.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'fs/promises';
import path from 'path';
import { formatDateTime } from '@/lib/formatTimestamp';
import { sanitizeForFont } from '@/lib/pdfTextSafety';

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
    return null;
  }
}

function day(value) {
  if (!value) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' });
}

function ageText(dateOfBirth, now = Date.now()) {
  if (!dateOfBirth) return null;
  const months = Math.floor((now - new Date(`${dateOfBirth}T12:00:00Z`).getTime()) / (30.44 * 24 * 60 * 60 * 1000));
  if (months < 0) return null;
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'}`;
}

// What the history page shows as a row's text (app/(admin)/patients/[id]/history).
function rowText(row) {
  return row.ai_summary || row.result || row.findings || row.notes || row.procedure_name || null;
}

export async function buildPatientHistoryPdf({ patient, client, clinic, vaccinations = [], outsideRecords = [], rows = [], now = Date.now() }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  pdfDoc.setTitle(`${patient?.name || 'Patient'}: medical history`);

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

  function wrapText(rawText, useFont, size, maxWidth) {
    const lines = [];
    // Keep the writer's own line breaks (summaries come in paragraphs).
    for (const para of String(rawText ?? '').split(/\n/)) {
      const words = sanitizeForFont(useFont, para).split(/\s+/).filter(Boolean);
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
      lines.push(current);
    }
    while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    return lines.length ? lines : [''];
  }

  function drawText(text, { size = 10.5, useFont = font, color = INK, gap = 14, x = MARGIN } = {}) {
    const maxWidth = PAGE_WIDTH - MARGIN - x;
    for (const line of wrapText(text, useFont, size, maxWidth)) {
      newPageIfNeeded(gap);
      if (line) page.drawText(line, { x, y, size, font: useFont, color });
      y -= line ? gap : gap * 0.6;
    }
  }

  function spacer(h) {
    y -= h;
  }

  function rule() {
    newPageIfNeeded(12);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: LIGHT_RULE });
    y -= 12;
  }

  function sectionHeading(text) {
    newPageIfNeeded(50);
    spacer(6);
    drawText(text, { size: 12, useFont: bold, color: PINK, gap: 17 });
    spacer(2);
  }

  // A label on the left, its value beside it.
  function fact(label, value) {
    if (!value) return;
    newPageIfNeeded(14);
    page.drawText(sanitizeForFont(bold, label), { x: MARGIN, y, size: 10, font: bold, color: GREY });
    const startY = y;
    drawText(value, { x: MARGIN + 110, size: 10.5 });
    if (y === startY) y -= 14;
  }

  // --- Header ---
  const headerTop = y;
  const logoW = 46;
  const logoH = logoImage ? logoW * logoRatio : 0;
  const textX = logoImage ? MARGIN + logoW + 14 : MARGIN;
  if (logoImage) page.drawImage(logoImage, { x: MARGIN, y: headerTop - logoH, width: logoW, height: logoH });
  const clinicName = clinic?.legal_name || 'Europets Veterinary Clinic';
  page.drawText(sanitizeForFont(bold, clinicName), { x: textX, y, size: 16, font: bold, color: PINK });
  y -= 18;
  page.drawText(TAGLINE, { x: textX, y, size: 9, font: italic, color: PINK });
  y -= 14;
  y = Math.min(y, headerTop - logoH) - 8;
  spacer(2);
  rule();
  spacer(10);

  drawText(`Medical History: ${patient?.name || 'Patient'}`, { size: 15, useFont: bold, gap: 20 });
  drawText(`Everything on file at ${clinicName} as of ${day(now)}, newest first.`, { color: GREY, size: 9.5, gap: 13 });
  spacer(8);

  // --- The pet ---
  fact('Patient', `${patient?.name || '-'}${patient?.patient_number ? ` (Patient #${patient.patient_number})` : ''}`);
  fact('Species', [patient?.species, patient?.breed].filter(Boolean).join(', '));
  fact('Sex', patient?.sex);
  fact('Colour', patient?.color);
  const age = ageText(patient?.date_of_birth, now);
  fact(
    'Date of birth',
    patient?.date_of_birth ? `${day(patient.date_of_birth)}${patient.date_of_birth_estimated ? ' (estimated)' : ''}${age ? `, ${age} old` : ''}` : null
  );
  fact(
    'Microchip',
    patient?.microchip_number ? `${patient.microchip_number}${patient.microchip_implanted_at ? `, implanted ${day(patient.microchip_implanted_at)}` : ''}` : 'Not recorded'
  );
  fact('Last weight', patient?.current_weight_kg != null ? `${patient.current_weight_kg} kg` : null);
  fact('Owner', client?.full_name ? `${client.full_name}${client.client_number ? ` (Client #${client.client_number})` : ''}` : null);
  spacer(6);
  rule();

  // --- Vaccinations ---
  sectionHeading('Vaccinations');
  if (vaccinations.length === 0) {
    drawText('No vaccinations recorded here.', { color: GREY });
  } else {
    const cols = [MARGIN, MARGIN + 95, MARGIN + 300, MARGIN + 395];
    newPageIfNeeded(30);
    ['Given', 'Vaccine', 'Next due', 'Batch'].forEach((h, i) => page.drawText(h, { x: cols[i], y, size: 9, font: bold, color: GREY }));
    y -= 14;
    for (const v of vaccinations) {
      newPageIfNeeded(16);
      const name = wrapText(v.vaccine_name || v.vaccine_protocols?.name || 'Vaccine', font, 10, cols[2] - cols[1] - 10);
      page.drawText(day(v.date_given) || '-', { x: cols[0], y, size: 10, font, color: INK });
      page.drawText(sanitizeForFont(font, String(v.next_due_date ? day(v.next_due_date) : '-')), { x: cols[2], y, size: 10, font, color: INK });
      page.drawText(sanitizeForFont(font, String(v.batch_number || '-')).slice(0, 20), { x: cols[3], y, size: 10, font, color: INK });
      for (const line of name) {
        page.drawText(line, { x: cols[1], y, size: 10, font, color: INK });
        y -= 13;
      }
      y -= 2;
    }
  }

  // --- Records from other clinics ---
  if (outsideRecords.length) {
    sectionHeading('Records from other clinics');
    for (const r of outsideRecords) {
      drawText(`${r.document_date ? `${day(r.document_date)}: ` : ''}${r.title || r.file_name || 'Document'}${r.source ? ` (${r.source})` : ''}`);
    }
    drawText('Copies are available from the clinic on request.', { color: GREY, size: 9.5, gap: 13 });
  }

  // --- Reports and tests ---
  sectionHeading('Visits, reports and tests');
  if (rows.length === 0) {
    drawText('No reports or tests on file yet.', { color: GREY });
  }
  for (const row of rows) {
    newPageIfNeeded(46);
    spacer(4);
    drawText(`${row.date ? day(row.date) : 'Date not recorded'}  ·  ${row.kind}`, { useFont: bold, size: 10.5, gap: 15 });
    const text = rowText(row);
    if (text) drawText(text.trim(), { size: 10, gap: 13.5 });
    else if (!row.lab_report_files?.length) drawText('No result recorded.', { color: GREY, size: 10, gap: 13.5 });
    if (row.lab_report_files?.length) {
      drawText(`Lab report on file: ${row.lab_report_files.join(', ')}. Ask the clinic for a copy.`, { color: GREY, size: 9.5, gap: 13 });
    }
    spacer(4);
  }

  // --- Watermark + footer on every page ---
  const pages = pdfDoc.getPages();
  const footerClinicLine = sanitizeForFont(font, [clinicName, TAGLINE].join('  -  '));
  const generatedLine = `Generated ${formatDateTime(new Date(now))}`;
  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i];
    if (logoImage) {
      const wmW = 260;
      const wmH = wmW * logoRatio;
      pg.drawImage(logoImage, { x: (PAGE_WIDTH - wmW) / 2, y: (PAGE_HEIGHT - wmH) / 2, width: wmW, height: wmH, opacity: 0.06 });
    }
    pg.drawLine({ start: { x: MARGIN, y: 44 }, end: { x: PAGE_WIDTH - MARGIN, y: 44 }, thickness: 1, color: LIGHT_RULE });
    const w1 = font.widthOfTextAtSize(footerClinicLine, 8);
    pg.drawText(footerClinicLine, { x: (PAGE_WIDTH - w1) / 2, y: 30, size: 8, font, color: GREY });
    const line2 = pages.length > 1 ? `Page ${i + 1} of ${pages.length}  ·  ${generatedLine}` : generatedLine;
    const w2 = font.widthOfTextAtSize(line2, 7.5);
    pg.drawText(line2, { x: (PAGE_WIDTH - w2) / 2, y: 18, size: 7.5, font, color: GREY });
  }

  return pdfDoc.save();
}
