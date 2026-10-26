// lib/stockKeeping.js
// The rules for stock keeping (migration 229): when an item is low and when
// the Stock team group hears about it. Pure, so it can be tested
// (tests/stock-keeping.test.mjs).

// Repeat the alert this often while an item stays low.
export const LOW_ALERT_REPEAT_DAYS = 7;

// Low: at or below its reorder level, once someone has counted or logged a
// delivery for it (before that, its number means nothing yet).
export function isLow(level) {
  return !!level && level.active !== false && level.started && Number(level.on_hand) <= Number(level.reorder_level);
}

// The low items due an alert now: never alerted for this drop, or alerted
// more than a week ago.
export function lowItemsToAlert(levels, now = Date.now()) {
  return (levels || []).filter(
    (l) => isLow(l) && (!l.low_alert_sent_at || now - Date.parse(l.low_alert_sent_at) >= LOW_ALERT_REPEAT_DAYS * 86400000)
  );
}

// Items back above their level: their alert is cleared, so the next drop
// alerts again straight away.
export function itemsRestocked(levels) {
  return (levels || []).filter((l) => l.low_alert_sent_at && !isLow(l));
}

const fmt = (n) => String(Math.round(Number(n) * 100) / 100);

// The message in the Stock team group.
export function lowStockMessage(items) {
  if (!items?.length) return null;
  const lines = items
    .slice()
    .sort((a, b) => Number(a.on_hand) - Number(b.on_hand))
    .map((l) => `• ${l.name}: ${Number(l.on_hand) <= 0 ? 'none left' : `${fmt(l.on_hand)} left`} (reorder at ${fmt(l.reorder_level)})`);
  return `📦 Low stock, time to reorder:\n${lines.join('\n')}\n\nLog the delivery on the Stock page when it comes in.`;
}

// A count: the movement that brings what's expected to what's on the shelf.
export function countChange(onHand, counted) {
  return Math.round((Number(counted) - Number(onHand)) * 100) / 100;
}
