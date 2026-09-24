// lib/weightLossAlarm.js
// Flags a clinically significant, rapid weight decline — 5% or more of
// body weight lost over roughly 3 days — purely from the hospitalization
// worksheet's own weight readings (hospitalization_notes.weight_kg), no
// separate manual entry. Only ever meaningful for a multi-day admission
// (see lib/hospitalizationAttention.js) — a day procedure never has 3
// days of readings to compare, and simply won't have enough history for
// this to ever trigger.

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const WEIGHT_LOSS_ALARM_THRESHOLD = 0.05; // 5%

// readings: [{ weight_kg, created_at }], any order, weight_kg may be null
// (a worksheet entry that didn't include a weight) — those are ignored.
// Compares the latest reading against the most recent one that's still at
// least 3 days older than it — a genuine "weight 3 days ago", not just
// whichever reading happens to be oldest on file — so a case admitted for
// only a day or two, with no reading that old yet, correctly reports no
// alarm rather than a false one off too short a window.
export function detectWeightLossAlarm(readings) {
  const sorted = (readings || [])
    .filter((r) => r.weight_kg != null)
    .map((r) => ({ weight_kg: Number(r.weight_kg), created_at: new Date(r.created_at) }))
    .sort((a, b) => a.created_at - b.created_at);

  if (sorted.length === 0) return null;
  const current = sorted[sorted.length - 1];
  const cutoff = new Date(current.created_at.getTime() - THREE_DAYS_MS);

  let baseline = null;
  for (const r of sorted) {
    if (r.created_at <= cutoff) baseline = r;
    else break;
  }
  if (!baseline || baseline.weight_kg <= 0) return null;

  const percentLoss = (baseline.weight_kg - current.weight_kg) / baseline.weight_kg;
  if (percentLoss < WEIGHT_LOSS_ALARM_THRESHOLD) return null;

  return {
    fromWeight: baseline.weight_kg,
    toWeight: current.weight_kg,
    percent: Math.round(percentLoss * 1000) / 10, // one decimal place
    days: Math.round(((current.created_at - baseline.created_at) / (24 * 60 * 60 * 1000)) * 10) / 10,
  };
}
