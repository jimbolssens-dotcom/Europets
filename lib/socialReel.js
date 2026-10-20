// lib/socialReel.js
// Server-side: makes a Social post's Reel from its photos (migration 207,
// plan in lib/socialReelPlan.js). Each photo is fetched, turned upright and
// cropped to a little over 1080x1920 around what's interesting in it; the
// text layers are drawn with the cover's font (lib/socialCover.js); ffmpeg
// (the ffmpeg-static binary that ships with the app) zooms, crossfades and
// adds the backing track (public/social-music, made by
// scripts/make-social-music.mjs); and the MP4 goes up next to the photos as
// social/<id>/reel-*.mp4.
//
// It has to finish inside the function's minute, so a Reel is kept short
// (about 8 to 13 seconds) and ffmpeg is stopped if it runs past REEL_TIMEOUT.

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import sharp from 'sharp';
import ffmpegStatic from 'ffmpeg-static';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { publicUrl } from '@/lib/socialDraft';
import { renderReelOverlay, renderReelEndCard } from '@/lib/socialCover';
import { INSTAGRAM_HANDLE } from '@/lib/clinicSocial';
import { REEL_W, REEL_H, REEL_FPS, reelPhotos, reelTexts, reelKey, reelFilterGraph } from '@/lib/socialReelPlan';

const REEL_TIMEOUT = 50 * 1000;
// Photos go in a little bigger than the frame, so the zoom stays sharp.
const SOURCE_W = Math.round(REEL_W * 1.1);
const SOURCE_H = Math.round(REEL_H * 1.1);

function ffmpegPath() {
  return process.env.FFMPEG_PATH || ffmpegStatic;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr = (stderr + d).slice(-4000)));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Making the Reel took too long. Try again with fewer photos.'));
    }, REEL_TIMEOUT);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}): ${stderr.split('\n').filter(Boolean).slice(-3).join(' ')}`));
    });
  });
}

async function fetchBuffer(url, what) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not read ${what}`);
  return Buffer.from(await res.arrayBuffer());
}

// Renders the Reel to an MP4 buffer. readPhoto(item) and readMusic(key)
// fetch the files, so this can run anywhere. Returns { video, total }.
export async function renderReel(post, { readPhoto, readMusic }) {
  const photos = reelPhotos(post);
  if (photos.length === 0) throw new Error('A Reel needs at least one photo.');
  const texts = reelTexts(post, photos);
  const music = post.reel_music && post.reel_music !== 'none' ? post.reel_music : null;

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reel-'));
  try {
    // The photos, upright and cropped around what matters in them, and the
    // text layers.
    await Promise.all(
      photos.map(async (i, k) => {
        await sharp(await readPhoto(post.media[i]))
          .rotate()
          .resize(SOURCE_W, SOURCE_H, { fit: 'cover', position: sharp.strategy.attention })
          .jpeg({ quality: 88 })
          .toFile(path.join(dir, `p${k}.jpg`));
        await fs.writeFile(path.join(dir, `t${k}.png`), await renderReelOverlay(REEL_W, REEL_H, texts[k], { first: k === 0 }));
      })
    );
    await fs.writeFile(path.join(dir, 'end.jpg'), await renderReelEndCard(REEL_W, REEL_H, INSTAGRAM_HANDLE));
    const inputs = [];
    for (let k = 0; k < photos.length; k++) inputs.push('-framerate', String(REEL_FPS), '-i', path.join(dir, `p${k}.jpg`));
    for (let k = 0; k < photos.length; k++) inputs.push('-framerate', String(REEL_FPS), '-i', path.join(dir, `t${k}.png`));
    inputs.push('-framerate', String(REEL_FPS), '-i', path.join(dir, 'end.jpg'));
    if (music) {
      await fs.writeFile(path.join(dir, 'music.m4a'), await readMusic(music));
      inputs.push('-i', path.join(dir, 'music.m4a'));
    }

    const { graph, total } = reelFilterGraph(photos.length, { music: !!music });
    const out = path.join(dir, 'reel.mp4');
    await runFfmpeg([
      '-hide_banner', '-loglevel', 'error', '-y',
      ...inputs,
      '-filter_complex', graph,
      '-map', '[v]',
      ...(music ? ['-map', '[a]', '-c:a', 'aac', '-b:a', '128k'] : []),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-r', String(REEL_FPS),
      '-movflags', '+faststart',
      out,
    ]);
    return { video: await fs.readFile(out), total };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Makes the Reel and saves it on the post. origin is this app's own address,
// for the backing track. Returns the post's new `reel` ({ path, key,
// duration, made_at }).
export async function makeSocialReel(post, origin) {
  const { video, total } = await renderReel(post, {
    readPhoto: (item) => fetchBuffer(publicUrl(item.path), item.name || 'a photo'),
    readMusic: (key) => fetchBuffer(`${origin}/social-music/${key}.m4a`, 'the music'),
  });
  const reelPath = `social/${post.id}/reel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp4`;
  const { error } = await supabaseAdmin.storage.from('consult-files').upload(reelPath, video, { contentType: 'video/mp4' });
  if (error) throw new Error(error.message);

  // The old one isn't needed any more.
  if (post.reel?.path) await supabaseAdmin.storage.from('consult-files').remove([post.reel.path]).catch(() => {});
  const reel = { path: reelPath, key: reelKey(post), duration: total, made_at: new Date().toISOString() };
  await supabaseAdmin.from('social_posts').update({ reel, updated_at: new Date().toISOString() }).eq('id', post.id);
  return reel;
}
