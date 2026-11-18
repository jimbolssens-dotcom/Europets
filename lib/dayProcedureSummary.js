// lib/dayProcedureSummary.js
// "Move to Hospital" (Jim, 18 Nov): a day procedure becomes a new hospital
// stay, and that stay's worksheet starts with ONE entry for the whole day
// procedure instead of every item logged on it. This writes that entry's
// text from the day procedure's worksheet: what was done and given (each
// item once, with a count), then any notes that say more than an item's
// name. Nothing is billed again: the items stay on the day procedure's own
// invoice, which can be merged into the stay's. Pure, so it can be tested.

const SKIP = /^(Synced automatically from the consult\.?|Daily hospitalisation charge|Overnight before the procedure.*)$/i;

export function dayProcedureSummary(notes, { dateLabel = '' } = {}) {
  const counts = new Map();
  const texts = [];
  const sorted = [...(notes || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  for (const n of sorted) {
    const names = (n.treatment_items || []).map((t) => t.goods_services?.name).filter(Boolean);
    for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
    const text = String(n.notes || '').trim();
    if (!text || SKIP.test(text)) continue;
    // A note that only repeats its own item's name says nothing new.
    if (names.some((name) => name.toLowerCase().startsWith(text.toLowerCase()) || text.toLowerCase().startsWith(name.toLowerCase()))) continue;
    if (!texts.includes(text)) texts.push(text);
  }
  const done = [...counts.entries()].map(([name, c]) => (c > 1 ? `${name} ×${c}` : name));
  const lines = [`From the day procedure${dateLabel ? ` on ${dateLabel}` : ''}.`];
  if (done.length) lines.push(`Done and given: ${done.join(', ')}.`);
  if (texts.length) lines.push(`Notes: ${texts.join('. ')}${/[.!?]$/.test(texts[texts.length - 1]) ? '' : '.'}`);
  lines.push("Billed on the day procedure's invoice.");
  return lines.join('\n');
}
