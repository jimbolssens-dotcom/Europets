// lib/socialReel.js
// Server-side: makes a Social post's Reel from its photos and video clips
// (migration 207, plan in lib/socialReelPlan.js). Each photo is fetched,
// turned upright and cropped to a little over 1080x1920 around what's
// interesting in it; each clip has its few seconds cut out and sized to
// 1080x1920 first, in a call of its own (prepareReelClip: a phone's 4K clip
// alone can take most of a minute to decode), and kept on the post; the
// text layers are drawn with the cover's font (lib/socialCover.js); ffmpeg
// (the ffmpeg-static binary that ships with the app) zooms, crossfades and
// adds the backing track (public/social-music, made by
// scripts/make-social-music.mjs); and the MP4 goes up next to the photos as
// social/<id>/reel-*.mp4.
//
// It has to finish inside the function's minute, so a Reel is kept short
// (about 8 to 15 seconds) and ffmpeg is stopped if it runs past REEL_TIMEOUT.

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { publicUrl } from '@/lib/socialDraft';
import { renderReelOverlay, renderReelEndCard } from '@/lib/socialCover';
import { preparePhoto } from '@/lib/socialTouchUp';
import { INSTAGRAM_HANDLE } from '@/lib/clinicSocial';
import { REEL_W, REEL_H, REEL_FPS, reelItems, reelTexts, reelKey, reelFilterGraph, clipCut, preparedClip } from '@/lib/socialReelPlan';

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

// A clip's length in seconds, from what ffmpeg prints about it (the
// ffmpeg-static package has no ffprobe). Null when it can't tell.
function clipLength(file) {
  return new Promise((resolve) => {
    const child = spawn(ffmpegPath(), ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', () => resolve(null));
    child.on('close', () => {
      const m = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
      resolve(m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null);
    });
  });
}

async function fetchBuffer(url, what) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not read ${what}`);
  return Buffer.from(await res.arrayBuffer());
}

// Renders the Reel to an MP4 buffer. readFile(item) and readMusic(key)
// fetch the files, so this can run anywhere. Returns { video, total }.
export async function renderReel(post, { readFile, readMusic }) {
  const items = reelItems(post);
  if (items.length === 0) throw new Error('A Reel needs at least one photo or video.');
  const kinds = items.map((i) => post.media[i].kind);
  const texts = reelTexts(post, items);
  const music = post.reel_music && post.reel_music !== 'none' ? post.reel_music : null;

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reel-'));
  try {
    // Photos upright and cropped around what matters in them; clips saved
    // as they are and measured; and the text layers.
    const files = [];
    const lengths = [];
    const prepared = [];
    await Promise.all(
      items.map(async (i, k) => {
        const item = post.media[i];
        const data = kinds[k] === 'video' && preparedClip(item, post.id) ? null : await readFile(item);
        if (kinds[k] === 'video') {
          // The prepared part when there is one (already cut and sized),
          // else the clip itself, cut here.
          const ready = preparedClip(item, post.id);
          files[k] = path.join(dir, `p${k}${ready ? '.mp4' : path.extname(item.path) || '.mp4'}`);
          await fs.writeFile(files[k], ready ? await readFile({ ...item, path: ready.path }) : data);
          prepared[k] = !!ready;
          lengths[k] = ready ? ready.length : await clipLength(files[k]);
        } else {
          files[k] = path.join(dir, `p${k}.jpg`);
          // With its touch-ups from the draft (lib/socialTouchUp.js).
          await fs.writeFile(files[k], await preparePhoto(data, item, { frame: 'fill', W: SOURCE_W, H: SOURCE_H, top: Math.round(SOURCE_H * 0.16), quality: 88 }));
        }
        await fs.writeFile(path.join(dir, `t${k}.png`), await renderReelOverlay(REEL_W, REEL_H, texts[k], { first: k === 0 }));
      })
    );
    await fs.writeFile(path.join(dir, 'end.jpg'), await renderReelEndCard(REEL_W, REEL_H, INSTAGRAM_HANDLE));

    const { graph, total, durations, starts } = reelFilterGraph(kinds, lengths, { music: !!music });
    const inputs = [];
    items.forEach((_, k) => {
      // A clip is cut to its part here, so only that much is decoded.
      if (kinds[k] === 'video' && prepared[k]) inputs.push('-t', String(durations[k] + 0.3), '-an', '-i', files[k]);
      else if (kinds[k] === 'video') inputs.push('-ss', String(starts[k]), '-t', String(durations[k] + 0.3), '-an', '-i', files[k]);
      else inputs.push('-framerate', String(REEL_FPS), '-i', files[k]);
    });
    items.forEach((_, k) => inputs.push('-framerate', String(REEL_FPS), '-i', path.join(dir, `t${k}.png`)));
    inputs.push('-framerate', String(REEL_FPS), '-i', path.join(dir, 'end.jpg'));
    if (music) {
      await fs.writeFile(path.join(dir, 'music.m4a'), await readMusic(music));
      inputs.push('-i', path.join(dir, 'music.m4a'));
    }

    const out = path.join(dir, 'reel.mp4');
    await runFfmpeg([
      '-hide_banner', '-loglevel', 'error', '-y',
      ...inputs,
      '-filter_complex', graph,
      '-map', '[v]',
      ...(music ? ['-map', '[a]', '-c:a', 'aac', '-b:a', '128k'] : []),
      '-c:v', 'libx264', '-preset', 'superfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-r', String(REEL_FPS),
      '-movflags', '+faststart',
      out,
    ]);
    return { video: await fs.readFile(out), total };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Cuts a clip's few seconds out and sizes them to 1080x1920 at the Reel's
// frame rate, so making the Reel itself stays quick. Saved next to the clip
// as social/<id>/reelclip-*.mp4. Returns the media item's `reel_clip`
// ({ path, source, length }), which the caller saves on the post.
export async function prepareReelClip(post, index) {
  const item = post.media?.[index];
  if (!item || item.kind !== 'video') throw new Error('That file is not a video');
  const ready = preparedClip(item, post.id);
  if (ready) return ready;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reelclip-'));
  try {
    const source = path.join(dir, `in${path.extname(item.path) || '.mp4'}`);
    await fs.writeFile(source, await fetchBuffer(publicUrl(item.path), item.name || 'the video'));
    const length = await clipLength(source);
    if (!length) throw new Error(`Couldn't read ${item.name || 'the video'}`);
    const { start, seconds } = clipCut(length);
    const out = path.join(dir, 'clip.mp4');
    await runFfmpeg([
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', String(start), '-t', String(seconds + 0.3), '-an', '-i', source,
      '-vf', `fps=${REEL_FPS},scale=${REEL_W}:${REEL_H}:force_original_aspect_ratio=increase,crop=${REEL_W}:${REEL_H},setsar=1,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-movflags', '+faststart',
      out,
    ]);
    const clipPath = `social/${post.id}/reelclip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp4`;
    const { error } = await supabaseAdmin.storage.from('consult-files').upload(clipPath, await fs.readFile(out), { contentType: 'video/mp4' });
    if (error) throw new Error(error.message);
    return { path: clipPath, source: item.path, length };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Makes the Reel and saves it on the post. origin is this app's own address,
// for the backing track. Returns the post's new `reel` ({ path, key,
// duration, made_at }).
export async function makeSocialReel(post, origin) {
  const { video, total } = await renderReel(post, {
    readFile: (item) => fetchBuffer(publicUrl(item.path), item.name || (item.kind === 'video' ? 'a video' : 'a photo')),
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
