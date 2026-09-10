// lib/dentalChartLayout.js
// Tooth positions for the interactive dental chart — schematic, not a
// traced anatomical drawing. Dogs are labeled with the anatomical
// shorthand (I/C/P/M per quadrant); cats use the Triadan numbering system
// (quadrant digit + position, e.g. 104 = upper right canine). Coordinates
// share one 500x600 unit box, reused as-is by the on-screen SVG chart
// (app/_components/DentalChart.jsx) and the PDF export
// (lib/procedureReportPdf.js) so both always match — the PDF just scales
// the whole box down to fit the page.
//
// This is an approximation read off a reference dental chart image, not
// a veterinary-verified tooth map — individual tooth positions/labels can
// be adjusted here if something's off, without touching either consumer.

export const BOX_WIDTH = 500;
export const BOX_HEIGHT = 600;

// Shared between the on-screen chart (app/_components/DentalChart.jsx)
// and the PDF export (lib/procedureReportPdf.js) so a tooth is always
// the same color everywhere.
export const TOOTH_COLORS = {
  extracted: { fill: '#f8d7da', stroke: '#dc2626' },
  missing: { fill: '#d4edda', stroke: '#16a34a' },
  normal: { fill: '#ffffff', stroke: '#999999' },
};

const CENTER_X = BOX_WIDTH / 2;
const UPPER_APEX_Y = 50;
const LOWER_APEX_Y = 550;
const ARCH_RX = 200;
const ARCH_RY = 250;
const MAX_ANGLE = 1.3; // radians (~74°) — how far the arch sweeps back from center

const SIZE = {
  I: { rx: 11, ry: 14 }, // incisor
  C: { rx: 16, ry: 22 }, // canine
  P: { rx: 13, ry: 17 }, // premolar
  M: { rx: 15, ry: 19 }, // molar
};

function archXY(side, t, apexY, curveSign) {
  const theta = t * MAX_ANGLE * side;
  const x = CENTER_X + Math.sin(theta) * ARCH_RX;
  const y = apexY + curveSign * (1 - Math.cos(Math.abs(theta))) * ARCH_RY;
  return { x, y };
}

// side: -1 (left) or 1 (right); t: 0 (front/center) .. 1 (far back)
function upperTooth(id, label, type, side, t) {
  const { x, y } = archXY(side, t, UPPER_APEX_Y, 1);
  return { id, label, arch: 'upper', side: side === -1 ? 'left' : 'right', cx: x, cy: y, ...SIZE[type] };
}
function lowerTooth(id, label, type, side, t) {
  const { x, y } = archXY(side, t, LOWER_APEX_Y, -1);
  return { id, label, arch: 'lower', side: side === -1 ? 'left' : 'right', cx: x, cy: y, ...SIZE[type] };
}

// --- Dog: anatomical shorthand, mirrored left/right ---
function dogLayout() {
  const teeth = [];
  for (const side of [-1, 1]) {
    const sfx = side === -1 ? 'R' : 'L';
    const uq = side === -1 ? '1' : '2';
    const lq = side === -1 ? '4' : '3';
    // Upper: I1-3, C1, P1-4, M1-2
    teeth.push(upperTooth(`${uq}01`, `${uq}01`, 'I', side, 0.08));
    teeth.push(upperTooth(`${uq}02`, `${uq}02`, 'I', side, 0.17));
    teeth.push(upperTooth(`${uq}03`, `${uq}03`, 'I', side, 0.26));
    teeth.push(upperTooth(`${uq}04`, `${uq}04`, 'C', side, 0.40));
    teeth.push(upperTooth(`${uq}05`, `${uq}05`, 'P', side, 0.48));
    teeth.push(upperTooth(`${uq}06`, `${uq}06`, 'P', side, 0.58));
    teeth.push(upperTooth(`${uq}07`, `${uq}07`, 'P', side, 0.68));
    teeth.push(upperTooth(`${uq}08`, `${uq}08`, 'P', side, 0.78));
    teeth.push(upperTooth(`${uq}09`, `${uq}09`, 'M', side, 0.89));
    teeth.push(upperTooth(`${uq}10`, `${uq}10`, 'M', side, 0.99));
    // Lower: I1-3, C1, P1-4, M1-3
    teeth.push(lowerTooth(`${lq}01`, `${lq}01`, 'I', side, 0.07),
    lowerTooth(`${lq}02`, `${lq}02`, 'I', side, 0.14),
    lowerTooth(`${lq}03`, `${lq}03`, 'I', side, 0.21),
    lowerTooth(`${lq}04`, `${lq}04`, 'C', side, 0.34),
    lowerTooth(`${lq}05`, `${lq}05`, 'P', side, 0.46),
    lowerTooth(`${lq}06`, `${lq}06`, 'P', side, 0.55),
    lowerTooth(`${lq}07`, `${lq}07`, 'P', side, 0.64),
    lowerTooth(`${lq}08`, `${lq}08`, 'P', side, 0.73),
    lowerTooth(`${lq}09`, `${lq}09`, 'M', side, 0.82),
    lowerTooth(`${lq}10`, `${lq}10`, 'M', side, 0.91),
    lowerTooth(`${lq}11`, `${lq}11`, 'M', side, 1.0),
    );
  }
  return teeth;
}

// --- Cat: Triadan numbering (quadrant 1=upper right, 2=upper left,
// 3=lower left, 4=lower right; cats skip several positions vs. dogs) ---
function catLayout() {
  const teeth = [];
  // side -1 = left (quadrants 2 upper / 3 lower), side 1 = right (1 upper / 4 lower)
  const upperQuadrant = { [-1]: '1', [1]: '2' };
  const lowerQuadrant = { [-1]: '4', [1]: '3' };
  const upperPositions = [
    ['01', 'I', 0.08],
    ['02', 'I', 0.17],
    ['03', 'I', 0.26],
    ['04', 'C', 0.40],
    ['06', 'P', 0.55],
    ['07', 'P', 0.68],
    ['08', 'P', 0.82],
    ['09', 'M', 0.95],
  ];
  const lowerPositions = [
    ['02', 'I', 0.12],
    ['03', 'I', 0.22],
    ['04', 'C', 0.38],
    ['07', 'P', 0.55],
    ['08', 'P', 0.72],
    ['09', 'M', 0.90],
  ];
  for (const side of [-1, 1]) {
    const uq = upperQuadrant[side];
    for (const [pos, type, t] of upperPositions) {
      const tooth = upperTooth(`${uq}${pos}`, `${uq}${pos}`, type, side, t);
      // Cats have a large upper fourth premolar (108/208) and a tiny upper
      // first molar (109/209); the shared type defaults need these feline
      // proportions corrected explicitly.
      if (pos === '08') Object.assign(tooth, { rx: 16, ry: 22 });
      if (pos === '09') Object.assign(tooth, { rx: 9, ry: 12 });
      teeth.push(tooth);
    }
    const lq = lowerQuadrant[side];
    for (const [pos, type, t] of lowerPositions) {
      teeth.push(lowerTooth(`${lq}${pos}`, `${lq}${pos}`, type, side, t));
    }
  }
  return teeth;
}

const LAYOUTS = {
  dog: dogLayout(),
  cat: catLayout(),
};

// Returns null for a species with no chart defined (only dog/cat for now).
export function getToothLayout(species) {
  const key = String(species || '').trim().toLowerCase();
  return LAYOUTS[key] || null;
}

// "Extracted" describes an action taken THIS visit — useful on the report
// that documents it — but by the next visit it's just an absent tooth,
// same as one that was already missing. Called when a consult with a
// dental report on it is completed (see app/api/visits/[id]/route.js),
// so the chart is only ever showing "extracted" for the visit that just
// happened, and reads as "missing" from then on.
export function lockExtractedTeeth(chart) {
  if (!chart) return chart;
  const next = { ...chart };
  for (const [toothId, state] of Object.entries(next)) {
    if (state === 'extracted') next[toothId] = 'missing';
  }
  return next;
}

// A plain-language summary of the chart's current extracted/missing teeth,
// for feeding to the AI dental-report summarizer as grounding context (see
// lib/anthropicClient.js) — null if there's no layout for this species or
// nothing is marked, so callers can skip adding it entirely.
export function describeDentalChart(species, chart) {
  const layout = getToothLayout(species);
  if (!layout || !chart) return null;

  const extracted = [];
  const missing = [];
  for (const tooth of layout) {
    const state = chart[tooth.id];
    const desc = `${tooth.label} (${tooth.arch} ${tooth.side})`;
    if (state === 'extracted') extracted.push(desc);
    else if (state === 'missing') missing.push(desc);
  }
  if (!extracted.length && !missing.length) return null;

  const lines = ['The clinic\'s dental chart for this patient currently shows:'];
  if (extracted.length) lines.push(`Extracted teeth: ${extracted.join(', ')}.`);
  if (missing.length) lines.push(`Teeth already missing before this visit: ${missing.join(', ')}.`);
  return lines.join(' ');
}
