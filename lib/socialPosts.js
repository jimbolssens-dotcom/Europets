// lib/socialPosts.js
// Small shared rules for the Social page (migration 202). Pure, so it can be
// tested (tests/social-draft.test.mjs).

import { reelBlocker } from './socialReelPlan.js';
import { layoutBlocker } from './socialLayoutPlan.js';

// Whether a post may go out as far as the owner's consent goes
// (clients.social_media_consent, migration 201): 'none' when no patient is
// in it, else 'yes', 'no' or 'not_asked'.
export function postConsent(post) {
  if (!post?.patient_id) return 'none';
  const answer = post.patients?.clients?.social_media_consent;
  return answer === true ? 'yes' : answer === false ? 'no' : 'not_asked';
}

// Why a post can't be approved yet, or null when it can.
export function approvalBlocker(post) {
  const media = Array.isArray(post?.media) ? post.media : [];
  if (!media.some((m) => !m.excluded)) return 'Every photo is left out: add one back or upload another.';
  if (!String(post?.caption_instagram || '').trim() && !String(post?.caption_facebook || '').trim()) return 'There is no caption yet.';
  const consent = postConsent(post);
  if (consent === 'no') return "The owner said no to social media, so this pet can't be posted.";
  if (consent === 'not_asked') return "The owner hasn't been asked yet. Ask them, then set 📸 Social to yes on their client page.";
  return reelBlocker(post) || layoutBlocker(post);
}
