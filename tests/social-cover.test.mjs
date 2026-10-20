import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanHeadline, wrapHeadline, fitHeadline, HEADLINE_MAX_CHARS } from '../lib/socialCoverLayout.js';

// One unit per character, so widths are easy to reason about.
const measure = (s) => s.length;
const measureAt = (size) => (s) => s.length * size;

test('the cover headline drops what the font cannot draw and tidies it', () => {
  const noEmoji = (ch) => ch.codePointAt(0) < 0x2000 || ch === '…';
  assert.equal(cleanHeadline('Make a wish 🎂  , Emman', noEmoji), 'Make a wish, Emman');
  assert.equal(cleanHeadline('Cake — a clinic record'), 'Cake, a clinic record');
  assert.equal(cleanHeadline('“Still the boss”'), '"Still the boss"');
  assert.equal(cleanHeadline('   '), '');
  assert.equal(cleanHeadline(null), '');
});

test('a too-long headline is cut at a word, never mid-word', () => {
  const long = 'Make a wish, the whole team downed tools for this one and nobody shared with the dogs';
  const out = cleanHeadline(long);
  assert.ok(out.length <= HEADLINE_MAX_CHARS);
  assert.ok(long.startsWith(out));
  assert.ok(long[out.length] === ' ' || long[out.length] === ',');
});

test('words wrap greedily and give up past the line limit', () => {
  assert.deepEqual(wrapHeadline('Four minutes of cake', measure, 12), ['Four minutes', 'of cake']);
  assert.equal(wrapHeadline('one two three four five six', measure, 5, 3), null);
});

test('the headline gets the biggest size that fits in three lines', () => {
  const { size, lines } = fitHeadline('Four minutes of cake a clinic record', measureAt, 100, { maxSize: 10, minSize: 4 });
  assert.equal(size, 6);
  assert.ok(lines.length <= 3);
  assert.ok(lines.every((l) => l.length * size <= 100));
});

test('if it never fits, the third line ends in an ellipsis inside the width', () => {
  const { size, lines } = fitHeadline('aaaa bbbb cccc dddd eeee ffff gggg', measureAt, 10, { maxSize: 2, minSize: 2 });
  assert.equal(size, 2);
  assert.equal(lines.length, 3);
  assert.ok(lines[2].endsWith('…'));
  assert.ok(lines[2].length * size <= 10);
});

test('a cut headline does not end on a dangling small word', () => {
  const out = cleanHeadline('Make a wish, the whole team downed tools for this one, and nobody shared');
  assert.equal(out, 'Make a wish, the whole team downed tools for this one');
});
