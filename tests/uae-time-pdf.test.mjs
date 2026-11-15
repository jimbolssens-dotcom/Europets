// Times on server-built PDFs (Jim, 15 Nov): the server runs on UTC and
// printed every worksheet time 4 hours early. Run under TZ=UTC to match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, formatDateTime, formatDayHeader, formatShortDate, formatWhenShort } from '../lib/formatTimestamp.js';
import { sanitizeForFont } from '../lib/pdfTextSafety.js';

process.env.TZ = 'UTC';

test('a worksheet time prints in UAE time, whatever the machine clock', () => {
  // 04:37 UTC is 08:37 in the UAE.
  assert.match(formatTime('2026-11-15T04:37:00Z'), /8:37/);
  assert.match(formatDateTime('2026-11-15T04:37:00Z'), /15\/11\/2026, 8:37/i);
  // 21:30 UTC on the 14th is already the 15th in the UAE.
  assert.equal(formatShortDate('2026-11-14T21:30:00Z'), '15/11/2026');
});

test('calendar dates stay the same day', () => {
  assert.equal(formatShortDate('2026-11-15'), '15/11/2026');
  assert.equal(formatDayHeader('2026-11-15'), 'Sunday, 15/11/2026');
});

test('"today" is judged in the UAE', () => {
  assert.doesNotMatch(formatWhenShort('2026-11-14T21:30:00Z', new Date('2026-11-15T05:00:00Z')), /Nov/);
});

test('a line break in PDF text becomes a space, not glued words', () => {
  const font = { widthOfTextAtSize: (ch) => { if (/[\n\r\t]/.test(ch)) throw new Error('WinAnsi'); return 5; } };
  assert.equal(sanitizeForFont(font, 'Eating well and active\nMila is eating'), 'Eating well and active Mila is eating');
});
