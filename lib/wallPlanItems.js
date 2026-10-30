// lib/wallPlanItems.js
// Which treatment plan items the hospital wall
// (app/(admin)/hospitalization/wall) shows for today. Daily and
// twice-daily items show every day. A one-time item ("X-ray first",
// "Consult", "Placed feeding tube") shows only on the day it was added:
// the wall used to keep every one-time item from earlier days, shown
// yellow because it hadn't been ticked today, so a long stay's tile
// filled up with old jobs. Jim: that day's items only. Pure, so it can be
// tested (tests/wall-plan-items.test.mjs).

// The UAE calendar date (YYYY-MM-DD) of a timestamp, or of now.
export function uaeDate(value = Date.now()) {
  return new Date(new Date(value).getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function wallItemsForToday(items, today = uaeDate()) {
  return (items || []).filter((item) => item.frequency !== 'one_time' || !item.created_at || uaeDate(item.created_at) === today);
}
