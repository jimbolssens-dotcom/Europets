// lib/socialUpload.js
// Client-side: uploads one photo or video for a Social post (migration 202)
// straight from the staff member's phone to the consult-files bucket, under
// social/<postId>/. The original is kept as it is (it's what gets posted);
// next to it goes a small JPEG for the AI to look at: the photo scaled down,
// or for a video a still frame taken in the browser, since the AI can't
// watch video.

import { supabase } from '@/lib/supabaseClient';

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const PREVIEW_MAX_SIDE = 1568;

function randomName(ext) {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
}

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i).replace(/[^A-Za-z0-9.]/g, '').slice(0, 10).toLowerCase() : '';
}

function canvasToJpeg(source, width, height) {
  const scale = Math.min(1, PREVIEW_MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85));
}

async function photoPreview(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    return await canvasToJpeg(img, img.naturalWidth, img.naturalHeight);
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

// Returns the media entry to store on the post: { path, preview_path, kind, name }.
export async function uploadSocialFile(postId, file) {
  const kind = file.type.startsWith('video/') ? 'video' : 'image';
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`${file.name} is too big (${Math.round(file.size / 1024 / 1024)} MB, the limit is 50 MB). Trim the video or film in 1080p.`);
  }
  const path = `social/${postId}/${randomName(extOf(file.name) || (kind === 'video' ? '.mp4' : '.jpg'))}`;
  const { error } = await supabase.storage.from('consult-files').upload(path, file, { contentType: file.type || undefined });
  if (error) throw new Error(`${file.name}: ${error.message}`);

  let previewPath = null;
  try {
    const blob = kind === 'video' ? await videoStill(file) : await photoPreview(file);
    if (blob) {
      previewPath = `social/${postId}/preview-${randomName('.jpg')}`;
      const { error: previewError } = await supabase.storage.from('consult-files').upload(previewPath, blob, { contentType: 'image/jpeg' });
      if (previewError) previewPath = null;
    }
  } catch {
    // A photo format the browser can't draw (or a video it can't seek):
    // the original still uploads, the AI just gets the original or skips it.
    previewPath = null;
  }
  return { path, preview_path: previewPath, kind, name: file.name };
}
