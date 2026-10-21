// lib/socialStory.js
// Server-side: one frame of a Social Story (migration 210): the photo
// cropped to a full-screen 9:16 around what matters in it, with the same
// text layer as the Reel (lib/socialCover.js): the cover headline and the
// hexagon logo on the first frame, a short line on a cut-corner card on the
// others. Clips go up as they are. Used for the preview on the draft
// (app/api/social-posts/[id]/story-frame) and for what's posted
// (lib/metaSocial.js), so they match.

import sharp from 'sharp';
import { renderReelOverlay } from '@/lib/socialCover';

export const STORY_W = 1080;
export const STORY_H = 1920;

// image: the photo as uploaded; returns a JPEG. width shrinks it, for the
// preview.
export async function renderStoryFrame(image, text, { first = false, width = STORY_W, quality = 90 } = {}) {
  const W = Math.round(width);
  const H = Math.round((width * STORY_H) / STORY_W);
  const base = await sharp(image).rotate().resize(W, H, { fit: 'cover', position: sharp.strategy.attention }).toBuffer();
  const overlay = await renderReelOverlay(W, H, text || '', { first });
  return sharp(base).composite([{ input: overlay, left: 0, top: 0 }]).jpeg({ quality }).toBuffer();
}
