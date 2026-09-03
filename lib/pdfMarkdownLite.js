// lib/pdfMarkdownLite.js
// AI-drafted clinical text (post-op instructions, dictated report
// summaries) comes back with light "markdown" — **bold** section labels
// on their own line, "-"/"*" bullets — meant to be rendered, not shown as
// literal asterisks. Shared parsing helpers for any pdf-lib builder that
// draws this kind of text; see postOpReleasePdf.js for the drawing side
// (mixed bold/regular word wrapping) that consumes these.

// Splits a paragraph's text into {word, bold, glue} tokens, asterisks
// stripped, so a line can mix bold and regular words when wrapped/drawn.
// glue: true means "no space before this word" — needed for e.g.
// "**10 days**," where the comma sits right against the closing ** with
// no space in the source text, so it must hug the previous word rather
// than getting a space inserted before it like every other word boundary.
// Whether a **bold** boundary needs gluing depends on BOTH sides of it —
// the plain-text segment before/after a ** run carries the actual
// whitespace, the ** markers themselves carry none — so this tracks
// whether the previous segment ended in whitespace, not just whether the
// current one starts with it.
export function tokenizeInline(text) {
  const tokens = [];
  const re = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > lastIndex) tokens.push({ text: text.slice(lastIndex, m.index), bold: false });
    tokens.push({ text: m[1], bold: true });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) tokens.push({ text: text.slice(lastIndex), bold: false });

  const words = [];
  let prevEndsWithSpace = true;
  for (const t of tokens) {
    if (!t.text) continue;
    const startsWithSpace = /^\s/.test(t.text);
    const endsWithSpace = /\s$/.test(t.text);
    const parts = t.text.split(/\s+/).filter(Boolean);
    parts.forEach((w, i) => {
      const glue = i === 0 && !startsWithSpace && !prevEndsWithSpace && words.length > 0;
      words.push({ word: w, bold: t.bold, glue });
    });
    prevEndsWithSpace = endsWithSpace;
  }
  return words;
}

// A line entirely wrapped in "**...**" (e.g. "**Findings:**") reads as a
// section heading, not a body paragraph.
export function isHeadingLine(rawLine) {
  return /^\*\*(.+)\*\*:?$/.test(rawLine.trim());
}

export function headingText(rawLine) {
  return rawLine.trim().replace(/^\*\*(.+?)\*\*:?$/, '$1').trim();
}

// "- " / "* " at the start of a line is a bullet marker, not a bold
// marker (bold markers always come in a "**" pair) — strip it and flag
// the line.
export function stripBullet(rawLine) {
  const m = rawLine.match(/^[-*]\s+(.*)$/);
  return m ? { isBullet: true, text: m[1] } : { isBullet: false, text: rawLine };
}
