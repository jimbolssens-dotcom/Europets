import test from 'node:test';
import assert from 'node:assert/strict';
import { statsTotals, statsScore, statsDue, bestPost, bestCaptions, statsLine } from '../lib/socialStatsPlan.js';
import { buildDraftText } from '../lib/socialDraftPrompt.js';

const H = 60 * 60 * 1000;
const now = Date.parse('2026-10-21T12:00:00Z');
const stats = (ig, fb = {}) => ({ instagram: ig, facebook: fb, fetched_at: new Date(now - 10 * H).toISOString() });

test('the score adds both networks, a comment, save or share counting more than a like', () => {
  const s = stats({ likes: 10, comments: 2, saves: 1, shares: 1 }, { reactions: 5, comments: 1, shares: 2 });
  assert.deepEqual(statsTotals(s), { likes: 15, comments: 3, saves: 1, shares: 3, reach: 0 });
  assert.equal(statsScore(s), 15 + 6 + 3 + 9);
  assert.equal(statsScore(null), 0);
  assert.equal(statsLine(s), '❤️ 15 · 💬 3 · 🔖 1 · ↗ 3');
});

test('numbers are fetched often at first, daily later, never for old or unposted posts', () => {
  const posted = (hoursAgo, fetchedHoursAgo) => ({
    status: 'posted',
    posted_at: new Date(now - hoursAgo * H).toISOString(),
    publish_state: { instagram: { id: '1' } },
    stats: fetchedHoursAgo === null ? null : { fetched_at: new Date(now - fetchedHoursAgo * H).toISOString() },
  });
  assert.ok(statsDue(posted(5, null), now));
  assert.ok(statsDue(posted(20, 4), now));
  assert.ok(!statsDue(posted(20, 1), now));
  assert.ok(!statsDue(posted(100, 10), now));
  assert.ok(statsDue(posted(100, 30), now));
  assert.ok(!statsDue(posted(50 * 24, null), now));
  assert.ok(!statsDue({ ...posted(5, null), publish_state: {} }, now));
  assert.ok(!statsDue({ ...posted(5, null), status: 'approved' }, now));
});

test("the best post is the week's top score, and the best captions teach the AI", () => {
  const p = (id, daysAgo, likes, caption = id) => ({ id, status: 'posted', posted_at: new Date(now - daysAgo * 24 * H).toISOString(), stats: stats({ likes }), caption_instagram: caption });
  const posts = [p('a', 1, 5), p('b', 3, 40), p('c', 10, 99), p('d', 2, 0)];
  assert.equal(bestPost(posts, { now }).post.id, 'b');
  assert.equal(bestPost([p('d', 2, 0)], { now }), null);
  assert.deepEqual(bestCaptions(posts, 2), ['c', 'b']);
  const text = buildDraftText({ story: 'x', mediaKinds: ['image'], examples: [], bestExamples: ['c'] });
  assert.match(text, /did best with our own followers[\s\S]*---\nc\n---/);
  assert.doesNotMatch(buildDraftText({ story: 'x', mediaKinds: ['image'], examples: [] }), /did best/);
});
