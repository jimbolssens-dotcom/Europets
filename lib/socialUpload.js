// lib/socialUpload.js
// Client-side: uploads one photo or video for a Social post (migration 202)
// straight from the staff member's phone to the consult-files bucket, under
// social/<postId>/. That file is what gets posted: the original, or for a
// big photo a smaller JPEG (still well above what Instagram and Facebook
// show). Next to it goes a small JPEG for the AI to look at: the photo
// scaled down, or for a video a still frame taken in the browser, since the
// AI can't watch video. Every upload is tried a few times, so a phone on
// patchy clinic wifi doesn't lose the post.

import { supabase } from '@/lib/supabaseClient';

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const PREVIEW_MAX_SIDE = 1568;
// Photos over this are re-saved as a JPEG this size: Instagram shows 1080 px
// and takes 8 MB at most, so nothing visible is lost.
const SHRINK_OVER_BYTES = 2.5 * 1024 * 1024;
const POST_MAX_SIDE = 2160;
const UPLOAD_TRIES = 3;

function randomName(ext) {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
}

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i).replace(/[^A-Za-z0-9.]/g, '').slice(0, 10).toLowerCase() : '';
}

function canvasToJpeg(source, width, height, maxSide = PREVIEW_MAX_SIDE, quality = 0.85) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality));
}

async function photoPreview(file, maxSide, quality) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    return await canvasToJpeg(img, img.naturalWidth, img.naturalHeight, maxSide, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// A still from about a third of the way in (at most 2 seconds), so it's
// past any shaky start.
async function videoStill(file) {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
    });
    video.currentTime = Math.min(2, (video.duration || 0) / 3);
    await new Promise((resolve, reject) => {
      video.onseeked = resolve;
      video.onerror = reject;
      setTimeout(resolve, 4000);
    });
    if (!video.videoWidth) return null;
    return await canvasToJpeg(video, video.videoWidth, video.videoHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// A big photo re-saved smaller, or the file as it is (a video, a small
// photo, or a format the browser can't draw).
async function forUpload(file) {
  if (!file.type.startsWith('image/') || file.size <= SHRINK_OVER_BYTES) return file;
  try {
    const blob = await photoPreview(file, POST_MAX_SIDE, 0.9);
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Tries again after a dropped connection ("Failed to fetch") or a server
// hiccup. If an earlier try did arrive and only the answer was lost, the
// file is already there, which counts as done.
async function uploadWithRetry(path, body, contentType) {
  let lastError;
  for (let attempt = 1; attempt <= UPLOAD_TRIES; attempt += 1) {
    try {
      const { error } = await supabase.storage.from('consult-files').upload(path, body, { contentType });
      if (!error || /already exists|duplicate/i.test(error.message || '')) return;
      lastError = error;
    } catch (err) {
      lastError = err;
    }
    if (attempt < UPLOAD_TRIES) await wait(attempt * 2000);
  }
  throw lastError;
}

// Returns the media entry to store on the post: { path, preview_path, kind, name }.
export async function uploadSocialFile(postId, file) {
  const kind = file.type.startsWith('video/') ? 'video' : 'image';
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`${file.name} is too big (${Math.round(file.size / 1024 / 1024)} MB, the limit is 50 MB). Trim the video or film in 1080p.`);
  }
  const body = await forUpload(file);
  const shrunk = body !== file;
  const path = `social/${postId}/${randomName(shrunk ? '.jpg' : extOf(file.name) || (kind === 'video' ? '.mp4' : '.jpg'))}`;
  try {
    await uploadWithRetry(path, body, shrunk ? 'image/jpeg' : file.type || undefined);
  } catch (err) {
    throw new Error(`${file.name} didn't upload (${err.message || 'connection dropped'}). Check the wifi and tap Make the post again.`);
  }

  let previewPath = null;
  try {
    const blob = kind === 'video' ? await videoStill(file) : await photoPreview(file);
    if (blob) {
      previewPath = `social/${postId}/preview-${randomName('.jpg')}`;
      await uploadWithRetry(previewPath, blob, 'image/jpeg');
    }
  } catch {
    // A photo format the browser can't draw (or a video it can't seek):
    // the original still uploads, the AI just gets the original or skips it.
    // Same if the preview itself won't upload.
    previewPath = null;
  }
  return { path, preview_path: previewPath, kind, name: file.name };
}
