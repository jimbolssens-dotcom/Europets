// lib/wallPlanItems.js
// Which treatment plan items the hospital wall
// (app/(admin)/hospitalization/wall) shows for today. Daily and
// twice-daily items show every day; every-other-day ones on their days. A one-time item ("X-ray first",
// "Consult", "Placed feeding tube") shows only on the day it was added:
// the wall used to keep every one-time item from earlier days, shown
// yellow because it hadn't been ticked today, so a long stay's tile
// filled up with old jobs. Jim: that day's items only. Pure, so it can be
// tested (tests/wall-plan-items.test.mjs).

// The UAE calendar date (YYYY-MM-DD) of a timestamp, or of now.
export function uaeDate(value = Date.now()) {
  return new Date(new Date(value).getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 'every_other_day' (Jim, 16 Nov; migration 255): due on the day it went
// on the plan, then every second day after (day 1, 3, 5...).
export function dueOn(item, date = uaeDate()) {
  if (item?.frequency !== 'every_other_day' || !item.created_at) return true;
  const start = uaeDate(item.created_at);
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
  return days >= 0 && days % 2 === 0;
}

export function wallItemsForToday(items, today = uaeDate()) {
  return (items || []).filter(
    (item) => (item.frequency !== 'one_time' || !item.created_at || uaeDate(item.created_at) === today) && dueOn(item, today)
  );
}
