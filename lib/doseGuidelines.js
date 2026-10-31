// lib/doseGuidelines.js
// Guideline doses (migration 237, the Dose guidelines page): the amount a
// medicine is filled in at from the pet's weight, and how far an entered
// amount is from it. Jim: staff sometimes give the wrong dose, so picking a
// medicine fills in the guideline amount (which is also what's billed),
// staff can change it, and outside the range it warns, and asks why before
// saving when it's well off. Pure, so it can be tested
// (tests/dose-guidelines.test.mjs).
//
// A guideline's rule says how the amount is worked out:
//   mg_per_kg      dose_per_kg x weight / strength, rounded to round_to;
//                  min_per_kg..max_per_kg is the range
//   per_kg_amount  amount_per_kg x weight (e.g. 0.1 ml per kg)
//   per_animal     fixed_amount; weight_min_kg..weight_max_kg is who it's for
//   bands          bands [{max_kg, amount}], then band_step_amount more per
//                  band_step_kg above the last band
//   note           guidance only, nothing filled in

const n = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

export function speciesKey(species) {
  const s = String(species || '').trim().toLowerCase();
  if (s.startsWith('cat') || s === 'feline' || s === 'kitten') return 'cat';
  if (s.startsWith('dog') || s === 'canine' || s === 'puppy') return 'dog';
  return s || null;
}

// The approved guidelines for this catalog item and species: the
// species' own rows if it has any, else the 'any' rows. Several rows means
// variants (GS: wet, dry, eye, neuro FIP).
export function guidelinesFor(all, goodsServiceId, species) {
  const rows = (all || []).filter((g) => g.goods_service_id === goodsServiceId && g.approved_at);
  const sp = speciesKey(species);
  const own = rows.filter((g) => g.species === sp);
  return own.length ? own : rows.filter((g) => g.species === 'any');
}

// Rounds to the guideline's step: 0.01 ml, a quarter tablet, a whole
// vial or capsule (never down to nothing).
export function roundAmount(value, step) {
  if (value == null || !Number.isFinite(value)) return null;
  const s = n(step) || 0.01;
  const rounded = Math.round(value / s) * s;
  const atLeast = rounded > 0 ? rounded : s;
  return Number(atLeast.toFixed(4));
}

function bandAmount(g, kg) {
  const bands = Array.isArray(g.bands) ? [...g.bands].sort((a, b) => a.max_kg - b.max_kg) : [];
  for (const b of bands) if (kg <= Number(b.max_kg)) return Number(b.amount);
  const last = bands[bands.length - 1];
  if (!last) return null;
  const step = n(g.band_step_kg);
  const more = n(g.band_step_amount);
  if (!step || !more) return Number(last.amount);
  return Number(last.amount) + Math.ceil((kg - Number(last.max_kg)) / step) * more;
}

// The amount to fill in for this weight, in the guideline's dose_unit, or
// null when it can't be worked out (no weight, a 'note' guideline).
export function proposedAmount(g, weightKg) {
  const kg = n(weightKg);
  if (!g) return null;
  if (g.rule === 'per_animal') return n(g.fixed_amount);
  if (g.rule === 'note') return null;
  if (!kg || kg <= 0) return null;
  if (g.rule === 'bands') return bandAmount(g, kg);
  if (g.rule === 'per_kg_amount') return roundAmount(n(g.amount_per_kg) * kg, g.round_to);
  if (g.rule === 'mg_per_kg') {
    if (!n(g.strength) || n(g.dose_per_kg) == null) return null;
    return roundAmount((n(g.dose_per_kg) * kg) / n(g.strength), g.round_to);
  }
  return null;
}

// The dose an amount works out at (mg or IU per kg), for mg_per_kg rules.
export function dosePerKg(g, amount, weightKg) {
  const kg = n(weightKg);
  const a = n(amount);
  if (!g || g.rule !== 'mg_per_kg' || !kg || kg <= 0 || a == null || !n(g.strength)) return null;
  return (a * n(g.strength)) / kg;
}

const fmt = (v) => {
  if (v == null) return '';
  const x = Number(v);
  if (x >= 10) return String(Math.round(x * 10) / 10);
  if (x >= 1) return String(Math.round(x * 100) / 100);
  return String(Math.round(x * 1000) / 1000);
};

// '½ tablet', '0.42 ml', '2 vials'.
export function formatAmount(amount, unit) {
  const a = n(amount);
  if (a == null) return '';
  const u = String(unit || '');
  if (u === 'tablet') {
    const whole = Math.floor(a);
    const frac = { 0.25: '¼', 0.5: '½', 0.75: '¾' }[Math.round((a - whole) * 100) / 100] || '';
    const text = `${whole || ''}${frac}` || '0';
    return `${text} tablet${a > 1 ? 's' : ''}`;
  }
  if (u === 'ml') return `${fmt(a)} ml`;
  return `${fmt(a)} ${u}${a === 1 || u.endsWith('s') ? '' : 's'}`;
}

// How an entered amount compares with the guideline for this weight:
//   level 'ok' | 'low' | 'high' (amber: within half/one and a half times
//   the range) | 'over' | 'under' (red: further off, needs a reason) |
//   'noweight' | 'none' (nothing to check against)
// with the text to show staff.
export function checkDose(g, amount, weightKg) {
  const a = n(amount);
  const kg = n(weightKg);
  if (!g || g.rule === 'note') return { level: 'none', text: g?.notes || '' };
  if (g.rule === 'per_animal') {
    if (n(g.weight_min_kg) != null && kg && (kg < n(g.weight_min_kg) || kg > n(g.weight_max_kg))) {
      return { level: 'over', text: `This product is for ${fmt(g.weight_min_kg)} to ${fmt(g.weight_max_kg)} kg; the pet is ${fmt(kg)} kg.` };
    }
    const want = n(g.fixed_amount);
    if (want == null || a == null) return { level: 'none', text: '' };
    if (Math.abs(a - want) < 1e-9) return { level: 'ok', text: 'The guideline amount.' };
    const ratio = a / want;
    return { level: ratio > 1.5 || ratio < 0.5 ? (ratio > 1 ? 'over' : 'under') : ratio > 1 ? 'high' : 'low', text: `The guideline is ${formatAmount(want, g.dose_unit)}.` };
  }
  if (!kg || kg <= 0) return { level: 'noweight', text: 'No weight on file: weigh the pet to check this dose.' };
  if (a == null || a <= 0) return { level: 'none', text: '' };
  if (g.rule === 'mg_per_kg') {
    const dose = dosePerKg(g, a, kg);
    const lo = n(g.min_per_kg) ?? n(g.dose_per_kg);
    const hi = n(g.max_per_kg) ?? n(g.dose_per_kg);
    const unit = `${g.strength_unit || 'mg'}/kg`;
    const range = lo === hi ? `${fmt(lo)} ${unit}` : `${fmt(lo)} to ${fmt(hi)} ${unit}`;
    // A whole vial or capsule can't be split: one step either side of the
    // range is as close as it gets, so that's still fine.
    const step = n(g.round_to) || 0.01;
    const slack = step >= 1 ? (step * n(g.strength)) / kg : 0;
    if (dose >= lo - slack - 1e-9 && dose <= hi + slack + 1e-9) return { level: 'ok', dose, text: `${fmt(dose)} ${unit}, in range (${range}).` };
    if (dose > hi) {
      const times = dose / hi;
      return { level: times > 1.5 ? 'over' : 'high', dose, text: `${fmt(dose)} ${unit}: ${times >= 1.95 ? `${fmt(times)}× the maximum` : 'above the range'} (${range}).` };
    }
    const part = dose / lo;
    return { level: part < 0.5 ? 'under' : 'low', dose, text: `${fmt(dose)} ${unit}: ${part < 0.5 ? `about ${Math.max(1, Math.round(part * 100))}% of the minimum` : 'below the range'} (${range}).` };
  }
  const want = proposedAmount(g, kg);
  if (want == null) return { level: 'none', text: '' };
  const ratio = a / want;
  if (ratio >= 0.9 && ratio <= 1.1) return { level: 'ok', text: `The guideline for ${fmt(kg)} kg is ${formatAmount(want, g.dose_unit)}.` };
  const level = ratio > 1.5 ? 'over' : ratio < 0.5 ? 'under' : ratio > 1 ? 'high' : 'low';
  return { level, text: `The guideline for ${fmt(kg)} kg is ${formatAmount(want, g.dose_unit)}.` };
}

// Red levels: saving needs a reason.
export const NEEDS_REASON = new Set(['over', 'under']);

// One line describing the guideline for this weight, e.g.
// 'Guideline for 4.2 kg: 0.42 ml (8 mg/kg), once, may repeat at 14 days'.
export function guidelineLine(g, weightKg) {
  if (!g) return '';
  const kg = n(weightKg);
  const amount = proposedAmount(g, kg);
  const how =
    g.rule === 'mg_per_kg'
      ? `${fmt(g.dose_per_kg)} ${g.strength_unit || 'mg'}/kg`
      : g.rule === 'per_kg_amount'
        ? `${fmt(g.amount_per_kg)} ${g.dose_unit} per kg`
        : g.notes || '';
  const head = amount != null && (kg || g.rule === 'per_animal') ? `${kg ? `For ${fmt(kg)} kg` : 'Guideline'}: ${formatAmount(amount, g.dose_unit)}` : 'Guideline';
  return [`${head}${how ? ` (${how})` : ''}`, g.frequency].filter(Boolean).join(', ');
}
