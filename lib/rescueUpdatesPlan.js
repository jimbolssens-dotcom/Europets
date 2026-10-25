// lib/rescueUpdatesPlan.js
// Pure rules for the daily rescue updates (migration 218,
// lib/rescueUpdates.js), so they can be tested
// (tests/rescue-updates.test.mjs).

// Instagram takes at most 10 photos in one post.
export const MAX_CASES_PER_POST = 10;

// Which day of their stay it is: the day they came in is day 1 (UAE dates).
export function stayDay(admittedAt, todayISO) {
  const admitted = new Date(admittedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
  const days = Math.round((Date.parse(`${todayISO}T00:00:00Z`) - Date.parse(`${admitted}T00:00:00Z`)) / 86400000);
  return Math.max(1, days + 1);
}

// What the sweep should do now for one partner: 'push' (the morning
// reminder, from 8am), 'nudge' (from 4pm, if photos are still missing and
// the post isn't made) or null. hour is the UAE hour.
export function rescueStep(hour, { partner, todayISO, cases, photos, drafted }) {
  if (!partner?.active || cases === 0 || drafted) return null;
  if (hour >= 8 && hour < 16 && partner.pushed_on !== todayISO) return 'push';
  if (hour >= 16 && hour < 19 && photos < cases && partner.nudged_on !== todayISO) return 'nudge';
  return null;
}

// Today's photos in the post's order: one per animal, in the order of the
// case list (longest stay first), the newest photo when one was retaken.
export function orderCaseMedia(media, caseIds) {
  const list = Array.isArray(media) ? media : [];
  const out = [];
  for (const id of caseIds) {
    const mine = list.filter((m) => m.patient_id === id);
    if (mine.length) out.push(mine[mine.length - 1]);
  }
  return out.slice(0, MAX_CASES_PER_POST);
}

// A Graph API error about the collaborators (the account can't be invited,
// or the post type doesn't allow it): post without them instead.
export function isCollaboratorError(err) {
  return /collaborator/i.test(String(err?.message || err || ''));
}

// A cat (or dog) counts as having a temperature from this, in °C.
export const FEVER_C = 39.3;

// What the hospital sheet (hospitalization_notes) says about one animal's
// last few days, as a few plain facts for its line in the rescue update:
// eating, help with eating, drinking, mood, temperature and weight since
// they came in. Only the ticked fields and numbers, never the free-text
// notes (those can name drugs or tests). notes: oldest first, each
// { note_date, appetite, drinking, mood, temperature_c, weight_kg,
// force_feeding_done }. todayISO: the UAE date of the update.
export function caseFacts(notes, todayISO) {
  const list = (notes || []).filter(Boolean);
  if (!list.length) return [];
  const facts = [];
  const latest = (field, from = list) => {
    for (let i = from.length - 1; i >= 0; i -= 1) if (from[i][field] != null && from[i][field] !== '') return from[i][field];
    return null;
  };
  const days = [...new Set(list.map((n) => n.note_date))].sort();
  const lastDay = days[days.length - 1];
  const before = list.filter((n) => n.note_date < lastDay);
  const recent = list.filter((n) => n.note_date === lastDay);

  // Eating: today's (or the latest day's) appetite, against the day before.
  const nowEat = latest('appetite', recent) || latest('appetite');
  const thenEat = latest('appetite', before);
  if (nowEat === 'good' && thenEat && thenEat !== 'good') facts.push('started eating well again');
  else if (nowEat === 'good') facts.push('eating well');
  else if (nowEat === 'reduced' && thenEat === 'none') facts.push('starting to eat a little');
  else if (nowEat === 'reduced') facts.push('eating a little');
  else if (nowEat === 'none') facts.push('not interested in food yet');
  if (recent.some((n) => n.force_feeding_done === true)) facts.push('being helped to eat');

  const drink = latest('drinking', recent);
  if (drink === 'good' && latest('drinking', before) && latest('drinking', before) !== 'good') facts.push('drinking well again');
  else if (drink === 'none' || drink === 'reduced') facts.push('drinking a little less than usual');

  const mood = latest('mood', recent) || latest('mood');
  if (mood === 'happy') facts.push(latest('mood', before) && latest('mood', before) !== 'happy' ? 'seems much brighter' : 'bright and happy');
  else if (mood === 'unhappy') facts.push('a bit quiet and down');

  // Temperature: today's highest, and whether there was one before.
  const temps = (from) => from.map((n) => Number(n.temperature_c)).filter((t) => t > 30 && t < 45);
  const todayTemps = temps(recent);
  const earlierFever = temps(before).some((t) => t >= FEVER_C);
  if (todayTemps.length) {
    const high = Math.max(...todayTemps);
    if (high >= FEVER_C) facts.push(earlierFever ? 'still has a bit of a temperature' : 'has a bit of a temperature today');
    else if (earlierFever) facts.push('temperature back to normal');
  }

  // Weight since they came in (first weighing on the sheet), when it moved
  // by at least 3%.
  const weights = list.map((n) => Number(n.weight_kg)).filter((w) => w > 0);
  if (weights.length >= 2) {
    const change = (weights[weights.length - 1] - weights[0]) / weights[0];
    if (change >= 0.03) facts.push('put on a little weight since coming in');
    else if (change <= -0.03) facts.push('lost a little weight since coming in');
  }
  if (lastDay && todayISO && lastDay < todayISO) facts.push(`(the sheet's latest entry is from ${lastDay})`);
  return facts;
}
