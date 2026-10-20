// lib/socialCoverLayout.js
// Laying out the headline on a Social post's cover photo (lib/socialCover.js,
// migration 206): which characters the font can draw, and how the words
// break into lines. Pure, so it can be tested (tests/social-cover.test.mjs).

export const HEADLINE_MAX_CHARS = 60;
export const HEADLINE_MAX_LINES = 3;

// Emoji and anything else the headline font has no shape for are dropped
// (they'd come out as empty boxes), and spacing is tidied. Long dashes become
// commas, as everywhere clients read. Too long, it's cut at a word.
export function cleanHeadline(text, hasChar = () => true) {
  const typed = String(text || '')
    .replace(/\s*[–—]\s*/g, ', ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
  const plain = [...typed]
    .filter((ch) => /\s/.test(ch) || hasChar(ch))
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();
  if (plain.length <= HEADLINE_MAX_CHARS) return plain;
  const cut = plain.slice(0, HEADLINE_MAX_CHARS + 1);
  let out = cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : HEADLINE_MAX_CHARS);
  // Not ending on a dangling "and" or "the".
  out = out.replace(/(\s+(and|or|but|the|a|an|of|to|for|with|in|on|at))+$/i, '');
  return out.replace(/[\s,.;:]+$/, '');
}

// Greedy word wrap: as many words per line as fit in maxWidth (measure gives
// a string's width). Null when it needs more than maxLines, so the caller
// tries a smaller size. A single word wider than the line still gets a line
// of its own: the caller's smallest size is what keeps that from happening.
export function wrapHeadline(text, measure, maxWidth, maxLines = HEADLINE_MAX_LINES) {
  const words = String(text || '').split(' ').filter(Boolean);
  const lines = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last && measure(`${last} ${word}`) <= maxWidth) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines.length <= maxLines ? lines : null;
}

// The biggest size, stepping down from maxSize, at which the headline fits.
// measureAt(size) returns a measure function for that size. If it doesn't
// fit even at minSize, the last line ends in "…".
export function fitHeadline(text, measureAt, maxWidth, { maxSize, minSize, step = 2, maxLines = HEADLINE_MAX_LINES }) {
  for (let size = maxSize; size >= minSize; size -= step) {
    const lines = wrapHeadline(text, measureAt(size), maxWidth, maxLines);
    if (lines) return { size, lines };
  }
  const measure = measureAt(minSize);
  const all = wrapHeadline(text, measure, maxWidth, Infinity);
  const lines = all.slice(0, maxLines);
  let last = `${lines[maxLines - 1]}…`;
  while (measure(last) > maxWidth && last.includes(' ')) last = `${last.slice(0, last.lastIndexOf(' ')).replace(/[\s,.;:]+$/, '')}…`;
  lines[maxLines - 1] = last;
  return { size: minSize, lines };
}
