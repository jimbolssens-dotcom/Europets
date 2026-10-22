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
