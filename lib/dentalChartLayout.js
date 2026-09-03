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
    const sfx = side === -1 ? 'L' : 'R';
    // Upper: I1-3, C1, P1-4, M1-2
    teeth.push(upperTooth(`U${sfx}_I1`, 'I1', 'I', side, 0.08));
    teeth.push(upperTooth(`U${sfx}_I2`, 'I2', 'I', side, 0.17));
    teeth.push(upperTooth(`U${sfx}_I3`, 'I3', 'I', side, 0.26));
    teeth.push(upperTooth(`U${sfx}_C1`, 'C1', 'C', side, 0.40));
    teeth.push(upperTooth(`U${sfx}_P1`, 'P1', 'P', side, 0.52));
    teeth.push(upperTooth(`U${sfx}_P2`, 'P2', 'P', side, 0.62));
    teeth.push(upperTooth(`U${sfx}_P3`, 'P3', 'P', side, 0.72));
    teeth.push(upperTooth(`U${sfx}_P4`, 'P4', 'P', side, 0.82));
    teeth.push(upperTooth(`U${sfx}_M1`, 'M1', 'M', side, 0.91));
    teeth.push(upperTooth(`U${sfx}_M2`, 'M2', 'M', side, 1.0));
    // Lower: I1-3, C1, P1-4, M1-3
    teeth.push(lowerTooth(`L${sfx}_I1`, 'I1', 'I', side, 0.07));
    teeth.push(lowerTooth(`L${sfx}_I2`, 'I2', 'I', side, 0.14));
    teeth.push(lowerTooth(`L${sfx}_I3`, 'I3', 'I', side, 0.21));
    teeth.push(lowerTooth(`L${sfx}_C1`, 'C1', 'C', side, 0.34));
    teeth.push(lowerTooth(`L${sfx}_P1`, 'P1', 'P', side, 0.46));
    teeth.push(lowerTooth(`L${sfx}_P2`, 'P2', 'P', side, 0.55));
    teeth.push(lowerTooth(`L${sfx}_P3`, 'P3', 'P', side, 0.64));
    teeth.push(lowerTooth(`L${sfx}_P4`, 'P4', 'P', side, 0.73));
    teeth.push(lowerTooth(`L${sfx}_M1`, 'M1', 'M', side, 0.82));
    teeth.push(lowerTooth(`L${sfx}_M2`, 'M2', 'M', side, 0.91));
    teeth.push(lowerTooth(`L${sfx}_M3`, 'M3', 'M', side, 1.0));
  }
  return teeth;
}

// --- Cat: Triadan numbering (quadrant 1=upper right, 2=upper left,
// 3=lower left, 4=lower right; cats skip several positions vs. dogs) ---
function catLayout() {
  const teeth = [];
  // side -1 = left (quadrants 2 upper / 3 lower), side 1 = right (1 upper / 4 lower)
  const upperQuadrant = { [-1]: '2', [1]: '1' };
  const lowerQuadrant = { [-1]: '3', [1]: '4' };
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
      teeth.push(upperTooth(`${uq}${pos}`, `${uq}${pos}`, type, side, t));
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
