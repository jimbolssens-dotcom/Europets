// lib/doseGuidelinesServer.js
// Checks a guideline dose sent from the Dose guidelines page before it's
// saved (app/api/dose-guidelines): only the table's own fields, numbers as
// numbers, and enough filled in for its rule to work out an amount.

const RULES = ['mg_per_kg', 'per_kg_amount', 'per_animal', 'bands', 'note'];
const SPECIES = ['cat', 'dog', 'any'];
const NUMBERS = [
  'strength', 'dose_per_kg', 'min_per_kg', 'max_per_kg', 'fixed_amount', 'amount_per_kg',
  'band_step_kg', 'band_step_amount', 'weight_min_kg', 'weight_max_kg', 'round_to',
];
const TEXTS = ['variant', 'strength_unit', 'dose_unit', 'frequency', 'notes', 'source'];

export function cleanGuideline(body, { requireItem }) {
  const row = {};
  if (requireItem) {
    if (!body.goods_service_id) return { error: 'Pick the medicine.' };
    row.goods_service_id = body.goods_service_id;
  }
  if ('species' in body || requireItem) {
    const species = body.species || 'any';
    if (!SPECIES.includes(species)) return { error: 'Species must be cat, dog or any.' };
    row.species = species;
  }
  if ('rule' in body || requireItem) {
    if (!RULES.includes(body.rule)) return { error: 'Pick how the dose is worked out.' };
    row.rule = body.rule;
  }
  for (const key of NUMBERS) {
    if (!(key in body)) continue;
    const v = body[key];
    if (v === null || v === '') row[key] = null;
    else if (Number.isFinite(Number(v)) && Number(v) >= 0) row[key] = Number(v);
    else return { error: `${key.replace(/_/g, ' ')} must be a number.` };
  }
  for (const key of TEXTS) if (key in body) row[key] = typeof body[key] === 'string' && body[key].trim() ? body[key].trim() : null;
  if ('strength_unit' in row && !row.strength_unit) row.strength_unit = 'mg';
  if ('dose_unit' in row && !row.dose_unit) row.dose_unit = 'ml';
  if ('bands' in body) {
    const bands = Array.isArray(body.bands) ? body.bands : null;
    if (bands && bands.some((b) => !Number.isFinite(Number(b?.max_kg)) || !Number.isFinite(Number(b?.amount)))) {
      return { error: 'Each weight band needs an up-to weight and an amount.' };
    }
    row.bands = bands ? bands.map((b) => ({ max_kg: Number(b.max_kg), amount: Number(b.amount) })) : null;
  }
  if (row.rule === 'mg_per_kg' && (row.strength == null || row.dose_per_kg == null) && requireItem) {
    return { error: 'A dose per kg needs the strength and the dose.' };
  }
  if (row.min_per_kg != null && row.max_per_kg != null && row.min_per_kg > row.max_per_kg) {
    return { error: 'The lowest dose is above the highest.' };
  }
  return { row };
}
