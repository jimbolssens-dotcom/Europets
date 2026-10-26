import test from 'node:test';
import assert from 'node:assert/strict';
import { futureDateError, uaeToday } from '../lib/vaccinationCourse.js';

// A dose was saved as given on 7 Dec 2026 in October.
test('a dose dated in the future is refused, today is not', () => {
  const now = Date.parse('2026-10-26T10:00:00+04:00');
  assert.ok(futureDateError('2026-12-07', now));
  assert.equal(futureDateError('2026-10-26', now), null);
  assert.equal(futureDateError(null, now), null);
});

test('"today" is the UAE day: just after midnight it is already the new day', () => {
  const now = Date.parse('2026-10-27T00:30:00+04:00');
  assert.equal(uaeToday(now), '2026-10-27');
  assert.equal(futureDateError('2026-10-27', now), null);
});
