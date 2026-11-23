// lib/cvrlForm.js
// CVRL's General Requisition Form (the lab's own PDF, assets/
// cvrl-requisition-form.pdf), filled in from the case (Jim, 23 Nov): the
// form that goes with every biopsy or other sample sent to CVRL. Uses the
// form's own fill-in fields, so it prints exactly like the lab's form; the
// fields stay editable in any PDF viewer for a last change.
//
// The field names inside CVRL's file don't all match their labels (the
// Owner's line is "SENDERS NME", the Cytology box is "TAXIDERMY"), so the
// map below goes by where each one sits on the page.

export const CVRL_SAMPLES = [
  { key: 'biopsy', label: 'Biopsy', field: 'BIOPSY MENTION SITE', siteField: 'undefined_3' },
  { key: 'swab', label: 'Swab', field: 'SWAB MENTION SITE', siteField: 'undefined_2' },
  { key: 'skin', label: 'Skin scrapings / scabs / hair', field: 'SKIN SCRAPINGSSCABSHAIR' },
  { key: 'urine', label: 'Urine', field: 'URINE' },
  { key: 'faeces', label: 'Faeces', field: 'FAECES' },
  { key: 'carcass', label: 'Carcass', field: 'CARCASS' },
];

export const CVRL_TESTS = [
  { key: 'histopathology', label: 'Histopathology', field: 'HISTOLOGYCYTOLOGY' },
  { key: 'cytology', label: 'Cytology', field: 'TAXIDERMY' },
  { key: 'bacterial_culture', label: 'Bacterial culture', field: 'BACTERIAL CULTURE' },
  { key: 'sensitivity', label: 'Sensitivity', field: 'SENSITIVITY' },
  { key: 'fungal_culture', label: 'Fungal culture', field: 'FUNGAL CULTURE' },
  { key: 'blood_culture', label: 'Blood culture', field: 'BLOOD CULTURE' },
  { key: 'parasitology', label: 'Parasitology', field: 'PARASITOLOGY' },
  { key: 'virus_isolation', label: 'Virus isolation', field: 'VIRUS ISOLATION' },
  { key: 'full_postmortem', label: 'Full postmortem', field: 'FULL POSTMORTEM' },
  { key: 'necropsy', label: 'Necropsy only', field: 'NECROPSY ONLY' },
];

// A test whose catalog name means a sample goes to the lab, and what to
// tick for it by default.
export function cvrlDefaults(testName) {
  const n = String(testName || '').toLowerCase();
  if (/autops|post\s*-?mortem|necrops/.test(n)) return { samples: ['carcass'], tests: ['full_postmortem'] };
  if (/cytolog|fna|fine needle/.test(n)) return { samples: ['biopsy'], tests: ['cytology'] };
  if (/culture|sensitiv/.test(n)) return { samples: ['swab'], tests: ['bacterial_culture', 'sensitivity'] };
  if (/biops|histopath|mass|tumou?r|excision/.test(n)) return { samples: ['biopsy'], tests: ['histopathology'] };
  return null;
}

export function isCvrlTest(testName) {
  return !!cvrlDefaults(testName);
}

function ageText(dob, at = new Date()) {
  if (!dob) return '';
  const d = new Date(dob);
  let months = (at.getFullYear() - d.getFullYear()) * 12 + (at.getMonth() - d.getMonth());
  if (at.getDate() < d.getDate()) months -= 1;
  if (months < 0) return '';
  if (months < 24) return `${months} month${months === 1 ? '' : 's'}`;
  return `${Math.floor(months / 12)} years`;
}

function uaeDateTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Everything the form says, from the case. Overrides (what staff ticked or
// typed in the app before printing) win.
export function cvrlFormData({ diagnostic, testName, patient, client, clinic, vetName, history, overrides = {} }) {
  const defaults = cvrlDefaults(testName) || { samples: ['biopsy'], tests: ['histopathology'] };
  const site = overrides.site ?? diagnostic?.description ?? '';
  const sex = String(patient?.sex || '').startsWith('female') ? 'F' : String(patient?.sex || '').startsWith('male') ? 'M' : '';
  const sender = [vetName, clinic?.legal_name || 'Europets Clinic'].filter(Boolean).join(', ');
  return {
    sampledAt: uaeDateTime(overrides.sampled_at || diagnostic?.created_at),
    owner: client?.full_name || '',
    sender,
    tel: clinic?.phone || '',
    address: clinic?.address || '',
    species: patient?.species ? patient.species[0].toUpperCase() + patient.species.slice(1) : '',
    breed: patient?.breed || '',
    age: ageText(patient?.date_of_birth),
    sex,
    animal: [patient?.name, patient?.patient_number ? `Patient #${patient.patient_number}` : null, patient?.microchip_number ? `Microchip ${patient.microchip_number}` : null].filter(Boolean).join(' · '),
    sampleLine: [testName, site].filter(Boolean).join(': '),
    resultsName: sender,
    resultsEmail: clinic?.email || '',
    invoiceTo: clinic?.legal_name || 'Europets Clinic',
    history: overrides.history ?? history ?? '',
    samples: overrides.samples ?? defaults.samples,
    tests: overrides.tests ?? defaults.tests,
    site,
    otherSample: overrides.other_sample || '',
    otherTest: overrides.other_test || '',
  };
}

import { PDFName, PDFNumber, rgb } from 'pdf-lib';

// Fills CVRL's PDF. pdf-lib's standard font only knows WinAnsi characters,
// so text is cleaned first (sanitize).
export async function fillCvrlForm(templateBytes, data, { PDFDocument, StandardFonts, sanitize = (t) => t }) {
  const doc = await PDFDocument.load(templateBytes);
  const form = doc.getForm();
  const text = (name, value, size = 9) => {
    if (!value) return;
    const f = form.getTextField(name);
    f.setFontSize(size);
    f.setText(sanitize(String(value)));
  };
  // A tick is drawn as a bold X inside the box rather than switching the
  // form's own check box on: CVRL's file draws its "on" state with a
  // symbol some viewers and printers show as a garbled mark.
  const page = doc.getPages()[0];
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const markBox = (widget) => {
    const r = widget.getRectangle();
    const size = Math.min(r.width, r.height) * 0.95;
    const w = bold.widthOfTextAtSize('X', size);
    page.drawText('X', { x: r.x + (r.width - w) / 2, y: r.y + (r.height - size * 0.72) / 2, size, font: bold });
  };
  const tick = (name, on = true) => {
    if (on) markBox(form.getCheckBox(name).acroField.getWidgets()[0]);
  };
  text('DATE AND TIME OF SAMPLING', data.sampledAt);
  text('SENDERS NME', data.owner);
  text('TRINERS NAME 2', data.sender, 8);
  text('TELMOB', data.tel);
  text('ADDRESS', data.address);
  text('SPECIES', data.species);
  text('BREED', data.breed, 8);
  text('AGE', data.age);
  // Sex: the M box is the radio group's first widget, F the second.
  // Its own field paints a white box over anything drawn underneath, so the
  // field is taken off and its two boxes drawn as plain squares instead.
  const sexGroup = form.getRadioGroup('Group1');
  const sexWidgets = sexGroup.acroField.getWidgets().map((w) => {
    w.dict.set(PDFName.of('F'), PDFNumber.of(2)); // hidden
    return w.getRectangle();
  });
  for (const r of sexWidgets) page.drawRectangle({ x: r.x, y: r.y, width: r.width, height: r.height, borderWidth: 0.8, borderColor: rgb(0, 0, 0) });
  const markRect = (r) => markBox({ getRectangle: () => r });
  if (data.sex === 'M') markRect(sexWidgets[0]);
  if (data.sex === 'F') markRect(sexWidgets[1]);
  text('NIMLS NMESMPLE ID 1', data.animal, 8);
  text('NIMLS NMESMPLE ID 2', data.sampleLine, 8);
  text('NAME', data.resultsName, 8);
  text('EMAILFAX', data.resultsEmail);
  text('INVOICE TO', data.invoiceTo);
  text('Text2', data.history, 8);
  for (const s of CVRL_SAMPLES) tick(s.field, data.samples.includes(s.key));
  if (data.samples.includes('biopsy')) text('undefined_3', data.site, 8);
  if (data.samples.includes('swab')) text('undefined_2', data.site, 8);
  if (data.otherSample) {
    tick('OTHERS SPECIFY');
    text('undefined_4', data.otherSample, 8);
  }
  for (const t of CVRL_TESTS) tick(t.field, data.tests.includes(t.key));
  if (data.otherTest) {
    tick('OTHERS SPECIFY_2');
    text('undefined_5', data.otherTest, 8);
  }
  return doc.save();
}
