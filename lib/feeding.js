// lib/feeding.js
// Food intake during a hospital stay (Jim, 5 Nov). Two kinds of feed, both
// saved as normal worksheet entries (hospitalization_notes, migration 244):
// - force-fed by syringe: millilitres of a recovery food, turned into kcal
//   and then into a share of the day's energy target;
// - eating by itself (free feeding): the existing Appetite answer, good /
//   reduced / none, the same one the worksheet and the cleaners' Quick
//   Check-In already write, so every source counts.
// Both go on one scale, % of the daily energy target, so one graph shows
// them: pink = force-fed (measured), blue = ate by itself (rated: "a little"
// drawn at a quarter, "ate well" at full height). Pure: used by
// app/api/hospitalizations/[id]/feeding and its tests.

// kcal per ml as fed (Convalescence Support once mixed as instructed).
export const FEEDING_FOODS = [
  { key: 'rc_recovery_liquid', name: 'Royal Canin Recovery Liquid', kcalPerMl: 1.0 },
  { key: 'hills_ad', name: "Hill's a/d", kcalPerMl: 1.1 },
  { key: 'rc_convalescence', name: 'Royal Canin Convalescence Support', kcalPerMl: 1.0 },
];

export function feedingFood(key) {
  return FEEDING_FOODS.find((f) => f.key === key) || null;
}

export const FORCE_FEED_ML_CHOICES = [5, 10, 15, 20, 30];

// Resting energy requirement, the usual starting target for a sick or
// hospitalized animal: 70 x bodyweight(kg)^0.75 kcal a day.
export function rerKcal(weightKg) {
  const kg = Number(weightKg);
  if (!Number.isFinite(kg) || kg <= 0) return null;
  return Math.round(70 * Math.pow(kg, 0.75));
}

export function forceFeedKcal(ml, foodKey) {
  const food = feedingFood(foodKey);
  const amount = Number(ml);
  if (!food || !Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * food.kcalPerMl * 10) / 10;
}

// The Appetite answers, best last, and how high each draws on the graph.
export const APPETITE_LEVELS = ['none', 'reduced', 'good'];
export const APPETITE_LABELS = { none: 'not eating', reduced: 'a little', good: 'ate well' };
export const APPETITE_GRAPH_PCT = { none: 0, reduced: 25, good: 100 };

function bestAppetite(a, b) {
  return APPETITE_LEVELS.indexOf(b) > APPETITE_LEVELS.indexOf(a) ? b : a;
}

function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// The weight the target is worked out from: the newest weight logged on the
// stay, else the weight on the patient's file.
export function latestWeight(notes, fileWeightKg) {
  const weighed = (notes || [])
    .filter((n) => n.weight_kg != null && Number(n.weight_kg) > 0)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (weighed.length) return Number(weighed[0].weight_kg);
  const fileKg = Number(fileWeightKg);
  return Number.isFinite(fileKg) && fileKg > 0 ? fileKg : null;
}

// The 3-day ramp-up (Jim, 21 Nov; migration 259): from its start day the
// day's target is a third, then two thirds, then the full target. Days
// before the start, or with no ramp-up, are the full target.
export const RAMP_DAYS = 3;
function daysBetween(fromIso, toIso) {
  return Math.round((new Date(`${toIso}T00:00:00Z`) - new Date(`${fromIso}T00:00:00Z`)) / 86400000);
}
export function rampFraction(rampStart, date) {
  if (!rampStart || !date || date < rampStart) return 1;
  const n = daysBetween(rampStart, date);
  return n >= RAMP_DAYS - 1 ? 1 : (n + 1) / RAMP_DAYS;
}
// Which ramp-up day a date is (1, 2, 3), or null once it's over / not on.
export function rampDay(rampStart, date) {
  if (!rampStart || !date || date < rampStart) return null;
  const n = daysBetween(rampStart, date) + 1;
  return n <= RAMP_DAYS ? n : null;
}
export function dayTargetKcal(targetKcal, rampStart, date) {
  if (!targetKcal) return null;
  return Math.round(targetKcal * rampFraction(rampStart, date));
}
// Millilitres a day and per feed of a food for a kcal target, per feed to
// the nearest half millilitre.
export function feedPlan(kcal, foodKey, feedsPerDay) {
  const food = feedingFood(foodKey);
  if (!food || !kcal) return null;
  const mlPerDay = Math.round(kcal / food.kcalPerMl);
  const feeds = Number(feedsPerDay) > 0 ? Number(feedsPerDay) : null;
  return { mlPerDay, feeds, mlPerFeed: feeds ? Math.round((kcal / food.kcalPerMl / feeds) * 2) / 2 : null };
}

// One entry per day from the first day to today (UAE dates), oldest first.
// rampStart: a ramp-up's first day; each day's % is then of that day's target.
export function dailyIntake(notes, { targetKcal, firstDay, today, rampStart = null }) {
  const byDay = new Map();
  for (const n of notes || []) {
    if (!n.note_date) continue;
    const day = byDay.get(n.note_date) || { fedKcal: 0, fedMl: 0, appetite: null, feeds: [] };
    if (n.feed_kind === 'forced' && Number(n.feed_kcal) > 0) {
      day.fedKcal += Number(n.feed_kcal);
      day.fedMl += Number(n.feed_ml) || 0;
      day.feeds.push({ at: n.created_at, kind: 'forced', ml: Number(n.feed_ml) || null, food: n.feed_food || null, kcal: Number(n.feed_kcal), authorId: n.author_id || null });
    }
    if (n.appetite && APPETITE_LEVELS.includes(n.appetite)) {
      day.appetite = day.appetite ? bestAppetite(day.appetite, n.appetite) : n.appetite;
      day.feeds.push({ at: n.created_at, kind: 'self', appetite: n.appetite, authorId: n.author_id || null });
    }
    byDay.set(n.note_date, day);
  }
  const start = firstDay || [...byDay.keys()].sort()[0] || today;
  const days = [];
  for (let date = start; date <= today; date = addDays(date, 1)) {
    const d = byDay.get(date) || { fedKcal: 0, fedMl: 0, appetite: null, feeds: [] };
    const fedKcal = Math.round(d.fedKcal * 10) / 10;
    const dayTarget = dayTargetKcal(targetKcal, rampStart, date);
    days.push({
      date,
      fedKcal,
      fedMl: d.fedMl,
      targetKcal: dayTarget,
      rampDay: rampDay(rampStart, date),
      fedPct: dayTarget ? Math.round((fedKcal / dayTarget) * 100) : 0,
      appetite: d.appetite,
      selfPct: d.appetite ? APPETITE_GRAPH_PCT[d.appetite] : 0,
      feeds: d.feeds.sort((a, b) => new Date(a.at) - new Date(b.at)),
      today: date === today,
    });
    if (days.length > 400) break;
  }
  return days;
}

// A long stay's "whole stay" view: one bar per 7 days, each the average.
export function weeklyIntake(days) {
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    const avg = (key) => Math.round(chunk.reduce((s, d) => s + d[key], 0) / chunk.length);
    weeks.push({
      week: weeks.length + 1,
      from: chunk[0].date,
      to: chunk[chunk.length - 1].date,
      fedPct: avg('fedPct'),
      selfPct: avg('selfPct'),
      fedKcal: Math.round(chunk.reduce((s, d) => s + d.fedKcal, 0)),
    });
  }
  return weeks;
}
