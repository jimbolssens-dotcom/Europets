// lib/socialStory.js
// Server-side: one frame of a Social Story (migration 210): the photo
// cropped to a full-screen 9:16 around what matters in it, with the same
// text layer as the Reel (lib/socialCover.js): the cover headline and the
// hexagon logo on the first frame, a short line on a cut-corner card on the
// others. Clips go up as they are. Used for the preview on the draft
// (app/api/social-posts/[id]/story-frame) and for what's posted
// (lib/metaSocial.js), so they match. The photo's touch-ups from the draft
// (lib/socialTouchUp.js) are drawn on it first.

import sharp from 'sharp';
import { renderReelOverlay } from '@/lib/socialCover';
import { preparePhoto } from '@/lib/socialTouchUp';

export const STORY_W = 1080;
export const STORY_H = 1920;

// image: the photo as uploaded, item: its media item (for the touch-ups);
// returns a JPEG. width shrinks it, for the preview.
export async function renderStoryFrame(image, text, { first = false, width = STORY_W, quality = 90, item = null } = {}) {
  const W = Math.round(width);
  const H = Math.round((width * STORY_H) / STORY_W);
  // The touch-ups keep clear of the logo and Instagram's bar at the top.
  const base = await preparePhoto(image, item, { frame: 'fill', W, H, top: Math.round(H * 0.14), quality: 95 });
  const overlay = await renderReelOverlay(W, H, text || '', { first });
  return sharp(base).composite([{ input: overlay, left: 0, top: 0 }]).jpeg({ quality }).toBuffer();
}
