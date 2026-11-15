// lib/doseCourse.js
// The dose bar on a once- or twice-daily task of a hospital Day Treatment
// Plan (Jim, 15 Nov; migration 253): one block per day from the day the
// task went on the plan, each with one stripe (once daily) or two
// (twice daily: the day's first dose on top, the second underneath, counted
// the same way as the plan's own "Afternoon not done yet" hint). A set
// course length makes the bar the whole course; open-ended, it grows a
// block a day. Long stays get thinner blocks (see densityFor) so it always
// fits the tile.

export const COURSE_PRESETS = [3, 5, 7, 10, 14, 21, 30];
export const MAX_COURSE_DAYS = 120;

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}

// A course length from a form: null (open) or a whole number 1..120.
export function cleanCourseDays(value) {
  if (value === null || value === undefined || value === '') return { value: null };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_COURSE_DAYS) return { error: `Course must be 1 to ${MAX_COURSE_DAYS} days` };
  return { value: n };
}

// startDate, today: UAE dates (YYYY-MM-DD). countsByDate: { date: doses
// logged that day }. Returns null for tasks that get no bar.
export function doseCourse({ frequency, startDate, today, courseDays = null, countsByDate = {} }) {
  const perDay = frequency === 'twice_daily' ? 2 : frequency === 'once_daily' ? 1 : 0;
  if (!perDay || !startDate || !today || today < startDate) return null;
  const dayNo = daysBetween(startDate, today) + 1;
  const total = courseDays ? Math.max(courseDays, dayNo) : dayNo;
  const days = [];
  for (let i = 0; i < total; i++) {
    const date = addDays(startDate, i);
    const given = countsByDate[date] || 0;
    const doses = [];
    for (let k = 1; k <= perDay; k++) {
      if (given >= k) doses.push('given');
      else if (date < today) doses.push('missed');
      else if (date === today) doses.push('due');
      else doses.push('future');
    }
    days.push({ date, doses });
  }
  let label;
  if (!courseDays) label = `Day ${dayNo}`;
  else if (dayNo < courseDays) label = `Day ${dayNo} of ${courseDays}`;
  else if (dayNo === courseDays) label = `Day ${dayNo} of ${courseDays} · last`;
  else label = `Day ${dayNo} · course was ${courseDays}`;
  return { days, dayNo, total, perDay, label, over: !!courseDays && dayNo > courseDays };
}

// How tightly to draw the blocks: the more days, the thinner each block
// and the smaller the gaps, so 40 days still fit one tile.
export function densityFor(total) {
  if (total > 30) return 'tight';
  if (total > 14) return 'dense';
  return 'normal';
}
