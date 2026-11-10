// lib/weightCheck.js
// A weight more than 10% away from the last one asks staff to double check
// before it's saved (Jim, 10 Nov: "286" was typed for a 2.86 kg cat and
// went into the graph). Used wherever staff enter a weight: the stay and
// day procedure vitals tiles, editing a worksheet entry, the consult's
// weight and the patient file.

export const WEIGHT_CHECK_FRACTION = 0.1;

// { pct, lastKg } when newKg is more than 10% off lastKg, else null.
export function weightJump(newKg, lastKg) {
  const next = Number(newKg);
  const last = Number(lastKg);
  if (!Number.isFinite(next) || !Number.isFinite(last) || next <= 0 || last <= 0) return null;
  const change = (next - last) / last;
  if (Math.abs(change) <= WEIGHT_CHECK_FRACTION + 1e-9) return null;
  return { pct: Math.round(Math.abs(change) * 100), up: change > 0, lastKg: last };
}

export function weightJumpMessage(newKg, lastKg) {
  const jump = weightJump(newKg, lastKg);
  if (!jump) return null;
  const pct = jump.pct >= 1000 ? `${Math.round(Number(newKg) / jump.lastKg)} times` : `${jump.pct}%`;
  return `${Number(newKg)} kg is ${pct} ${jump.pct >= 1000 ? 'the' : jump.up ? 'more than the' : 'less than the'} last weight (${jump.lastKg} kg).\n\nIs that right?`;
}

// true to go ahead: no big change, or staff confirmed it.
export function confirmWeight(newKg, lastKg) {
  const message = weightJumpMessage(newKg, lastKg);
  if (!message || typeof window === 'undefined') return true;
  return window.confirm(`⚠️ Please double check the weight\n\n${message}`);
}
