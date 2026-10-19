// lib/socialPublishPlan.js
// What goes out where when a Social post is published (lib/metaSocial.js).
// Pure, so it can be tested (tests/social-publish.test.mjs).

const IG_MIN_RATIO = 4 / 5; // tallest portrait Instagram takes
const IG_MAX_RATIO = 1.91; // widest landscape

// The centre crop that brings a photo inside Instagram's limits (the whole
// photo when it's already inside them), as sharp's extract() region.
export function fitInstagramRatio(width, height) {
  const ratio = width / height;
  if (ratio < IG_MIN_RATIO) {
    const h = Math.round(width / IG_MIN_RATIO);
    return { left: 0, top: Math.round((height - h) / 2), width, height: h };
  }
  if (ratio > IG_MAX_RATIO) {
    const w = Math.round(height * IG_MAX_RATIO);
    return { left: Math.round((width - w) / 2), top: 0, width: w, height };
  }
  return { left: 0, top: 0, width, height };
}

// Instagram: one photo, one video as a Reel, or a carousel of up to 10
// (photos and videos mixed), cover first.
export function instagramPlan(items) {
  const list = items.slice(0, 10);
  if (list.length === 1) return { kind: list[0].kind === 'video' ? 'reel' : 'image', items: list };
  return { kind: 'carousel', items: list };
}

// Facebook: a Page post can hold several photos, but a video goes up on its
// own, so a post with a video shares the (first) video and the caption.
export function facebookPlan(items) {
  const video = items.find((m) => m.kind === 'video');
  if (video) return { kind: 'video', items: [video] };
  return { kind: 'photos', items: items.slice(0, 10) };
}
