// There is no structured dose schedule in the current plan-item schema.
// Only explicit morning/evening words are grouped; do not infer doses
// from BID, frequencies, clock times, or completion timestamps.
export function treatmentColumns(items) {
  const morning = [];
  const evening = [];
  const other = [];
  for (const item of items) {
    const text = `${item.label || ''} ${item.instructions || ''}`;
    const am = /\bmorning\b/i.test(text);
    const pm = /\bevening\b/i.test(text);
    if (am && !pm) morning.push(item);
    else if (pm && !am) evening.push(item);
    else other.push(item);
  }
  if (!other.length && morning.length && evening.length) {
    return [{ label: 'Morning', items: morning }, { label: 'Evening', items: evening }];
  }
  const split = Math.ceil(items.length / 2);
  return [{ label: null, items: items.slice(0, split) }, { label: null, items: items.slice(split) }];
}
