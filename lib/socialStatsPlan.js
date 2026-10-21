// lib/socialStatsPlan.js
// How posted Social posts did (migration 212, lib/socialStats.js): one score
// per post from its likes, comments, saves and shares on Instagram and
// Facebook, when to fetch the numbers again, and the best post of the week.
// Pure, so it can be tested (tests/social-stats.test.mjs).

const DAY = 24 * 60 * 60 * 1000;
// Numbers are kept fresh for this long after posting; after that they
// barely move.
export const STATS_DAYS = 45;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// The post's numbers added up over both networks.
export function statsTotals(stats) {
  const ig = stats?.instagram || {};
  const fb = stats?.facebook || {};
  return {
    likes: num(ig.likes) + num(fb.reactions),
    comments: num(ig.comments) + num(fb.comments),
    saves: num(ig.saves),
    shares: num(ig.shares) + num(fb.shares),
    reach: num(ig.reach),
  };
}

// A comment, save or share says more than a like.
export function statsScore(stats) {
  const t = statsTotals(stats);
  return t.likes + 2 * t.comments + 3 * t.saves + 3 * t.shares;
}

// Whether a posted post's numbers should be fetched again: often in its
// first two days, daily after that, not at all after STATS_DAYS.
export function statsDue(post, now = Date.now()) {
  if (post?.status !== 'posted' || !post.posted_at) return false;
  const state = post.publish_state || {};
  if (!state.instagram?.id && !state.facebook?.id) return false;
  const age = now - new Date(post.posted_at).getTime();
  if (age > STATS_DAYS * DAY) return false;
  const fetched = post.stats?.fetched_at ? new Date(post.stats.fetched_at).getTime() : 0;
  return now - fetched > (age < 2 * DAY ? 3 * 60 * 60 * 1000 : DAY);
}

// The post that did best among those posted in the last `days`, or null.
export function bestPost(posts, { now = Date.now(), days = 7 } = {}) {
  let best = null;
  for (const p of posts || []) {
    if (p.status !== 'posted' || !p.stats || !p.posted_at) continue;
    if (now - new Date(p.posted_at).getTime() > days * DAY) continue;
    const score = statsScore(p.stats);
    if (score > 0 && (!best || score > best.score)) best = { post: p, score };
  }
  return best;
}

// Captions to show the AI as what works: the best-scoring posted ones
// first. posts need caption_instagram and stats.
export function bestCaptions(posts, count = 3) {
  return [...(posts || [])]
    .filter((p) => p.caption_instagram && p.stats && statsScore(p.stats) > 0)
    .sort((a, b) => statsScore(b.stats) - statsScore(a.stats))
    .slice(0, count)
    .map((p) => p.caption_instagram);
}

// "❤️ 24 · 💬 3 · 🔖 2", for a chip.
export function statsLine(stats) {
  const t = statsTotals(stats);
  return [`❤️ ${t.likes}`, `💬 ${t.comments}`, t.saves && `🔖 ${t.saves}`, t.shares && `↗ ${t.shares}`, t.reach && `👀 ${t.reach}`].filter(Boolean).join(' · ');
}
