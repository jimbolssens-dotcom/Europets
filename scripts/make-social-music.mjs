// scripts/make-social-music.mjs
// Makes the backing tracks for Social Reels (lib/socialReel.js) from
// scratch, so they're the clinic's own and free of any licence: plucked
// strings (Karplus-Strong), a soft electric piano, a marimba, light
// percussion and a little reverb. Run once; the tracks are committed in
// public/social-music/.
//
//   node scripts/make-social-music.mjs   (needs ffmpeg on the PATH)

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const RATE = 44100;
const SECONDS = 20;
const OUT = path.join(process.cwd(), 'public', 'social-music');

// A seeded random, so the tracks come out the same every run.
let seed = 12345;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
function freq(name) {
  const [, n, o] = name.match(/^([A-G]#?)(\d)$/);
  return 440 * 2 ** ((NOTE[n] + (Number(o) + 1) * 12 - 69) / 12);
}

function track() {
  return { l: new Float32Array(RATE * SECONDS), r: new Float32Array(RATE * SECONDS) };
}

function add(t, start, samples, gain = 1, pan = 0) {
  const i0 = Math.round(start * RATE);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < samples.length && i0 + i < t.l.length; i++) {
    if (i0 + i < 0) continue;
    t.l[i0 + i] += samples[i] * gl;
    t.r[i0 + i] += samples[i] * gr;
  }
}

// Plucked string: a noise burst in a delay line, averaged each pass.
function pluck(f, seconds = 1.6, bright = 0.5) {
  const n = Math.round(RATE / f);
  const buf = new Float32Array(n).map(() => rand() * 2 - 1);
  // Soften the burst a little so it reads as nylon, not steel.
  for (let k = 0; k < 2; k++) for (let i = 1; i < n; i++) buf[i] = buf[i] * bright + buf[i - 1] * (1 - bright);
  const out = new Float32Array(Math.round(seconds * RATE));
  let idx = 0;
  for (let i = 0; i < out.length; i++) {
    const a = buf[idx];
    const b = buf[(idx + 1) % n];
    out[i] = a;
    buf[idx] = 0.996 * 0.5 * (a + b);
    idx = (idx + 1) % n;
  }
  const fade = Math.round(0.05 * RATE);
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  return out;
}

// Electric piano: a few sines, a soft attack, a long decay, a slow tremolo.
function epiano(f, seconds = 2.2) {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.008) * Math.exp(-t * 1.6);
    const trem = 1 + 0.12 * Math.sin(2 * Math.PI * 4.5 * t);
    out[i] =
      env * trem *
      (Math.sin(2 * Math.PI * f * t) +
        0.28 * Math.exp(-t * 4) * Math.sin(2 * Math.PI * 2 * f * t) +
        0.08 * Math.exp(-t * 8) * Math.sin(2 * Math.PI * 3.01 * f * t));
  }
  return out;
}

// Marimba / glockenspiel: a sine and a fast-fading upper partial.
function mallet(f, seconds = 0.9, partial = 3.99, decay = 5) {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    out[i] = Math.min(1, t / 0.002) * (Math.exp(-t * decay) * Math.sin(2 * Math.PI * f * t) + 0.35 * Math.exp(-t * decay * 4) * Math.sin(2 * Math.PI * f * partial * t));
  }
  return out;
}

function kick(seconds = 0.35) {
  const out = new Float32Array(Math.round(seconds * RATE));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    phase += (2 * Math.PI * (48 + 90 * Math.exp(-t * 30))) / RATE;
    out[i] = Math.sin(phase) * Math.exp(-t * 9);
  }
  return out;
}

// Filtered noise: shaker (short, bright) or clap (a few quick bursts).
function noise(seconds, decay, tone = 0.5, bursts = 1) {
  const out = new Float32Array(Math.round(seconds * RATE));
  let lp = 0;
  let prev = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const w = rand() * 2 - 1;
    lp += tone * (w - lp);
    const hp = lp - prev;
    prev = lp;
    let env = Math.exp(-t * decay);
    if (bursts > 1) env *= 0.6 + 0.4 * Math.cos(2 * Math.PI * t * 90) * (t < 0.03 ? 1 : 0);
    out[i] = hp * env;
  }
  return out;
}

function chordStrum(t, at, notes, down = true, gain = 0.22, spread = 0.014) {
  const order = down ? notes : [...notes].reverse();
  order.forEach((n, k) => add(t, at + k * spread, pluck(freq(n), 1.4, 0.55), gain * (down ? 1 : 0.65), -0.3 + k * 0.2));
}

// A small Schroeder reverb, mixed in low.
function reverb(t, mix = 0.18) {
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ d, buf: new Float32Array(d), i: 0 }));
  const allp = [225, 556].map((d) => ({ d, buf: new Float32Array(d), i: 0 }));
  for (const ch of ['l', 'r']) {
    const x = t[ch];
    const y = new Float32Array(x.length);
    for (const c of combs) c.buf.fill(0);
    for (let n = 0; n < x.length; n++) {
      let s = 0;
      for (const c of combs) {
        const out = c.buf[c.i];
        c.buf[c.i] = x[n] + out * 0.8;
        c.i = (c.i + 1) % c.d;
        s += out;
      }
      s /= combs.length;
      for (const a of allp) {
        const out = a.buf[a.i];
        a.buf[a.i] = s + out * 0.5;
        a.i = (a.i + 1) % a.d;
        s = out - s * 0.5;
      }
      y[n] = s;
    }
    for (let n = 0; n < x.length; n++) x[n] = x[n] * (1 - mix) + y[n] * mix * 2.2;
  }
}

function finish(t, name) {
  reverb(t);
  let peak = 0;
  for (const ch of [t.l, t.r]) for (const v of ch) peak = Math.max(peak, Math.abs(v));
  const g = 0.85 / peak;
  const fadeIn = 0.15 * RATE;
  const fadeOut = 2 * RATE;
  const pcm = Buffer.alloc(t.l.length * 4);
  for (let i = 0; i < t.l.length; i++) {
    const env = Math.min(1, i / fadeIn) * Math.min(1, (t.l.length - i) / fadeOut);
    pcm.writeInt16LE(Math.round(Math.tanh(t.l[i] * g) * env * 32767), i * 4);
    pcm.writeInt16LE(Math.round(Math.tanh(t.r[i] * g) * env * 32767), i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  const wav = path.join(os.tmpdir(), `${name}.wav`);
  fs.writeFileSync(wav, Buffer.concat([header, pcm]));
  fs.mkdirSync(OUT, { recursive: true });
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-c:a', 'aac', '-b:a', '128k', path.join(OUT, `${name}.m4a`)]);
  fs.unlinkSync(wav);
  console.log(`public/social-music/${name}.m4a`);
}

// "Sunny": ukulele strums, C G Am F at 100 bpm, kick, shaker and a few
// glockenspiel notes on top.
function sunny() {
  const t = track();
  const beat = 60 / 100;
  const chords = [
    ['G4', 'C4', 'E4', 'C5'],
    ['G4', 'D4', 'G4', 'B4'],
    ['A4', 'C4', 'E4', 'A4'],
    ['A4', 'C4', 'F4', 'A4'],
  ];
  const roots = ['C3', 'G2', 'A2', 'F2'];
  // Down, down-up, up-down-up: the classic strum.
  const strum = [[0, true], [1, true], [1.5, false], [2.5, false], [3, true], [3.5, false]];
  const melody = [['E5', 0], ['G5', 1], ['A5', 1.5], ['G5', 2], ['E5', 3]];
  for (let bar = 0; bar * 4 * beat < SECONDS; bar++) {
    const at = bar * 4 * beat;
    const ch = chords[bar % 4];
    for (const [b, down] of strum) chordStrum(t, at + b * beat, ch, down);
    add(t, at, pluck(freq(roots[bar % 4]), 1.2, 0.3), 0.5);
    add(t, at + 2 * beat, pluck(freq(roots[bar % 4]), 1.0, 0.3), 0.35);
    for (const b of [0, 2]) add(t, at + b * beat, kick(), 0.5);
    for (let e = 0; e < 8; e++) add(t, at + e * beat * 0.5, noise(0.08, 60, 0.9), e % 2 ? 0.07 : 0.035, 0.4);
    if (bar % 2 === 1) for (const [n, b] of melody) add(t, at + b * beat, mallet(freq(n), 1.2, 2.76, 3), 0.1, 0.2);
  }
  finish(t, 'sunny');
}

// "Gentle": soft electric piano arpeggios, Fmaj7 Am7 Bbmaj7 C at 76 bpm,
// with a light tick.
function gentle() {
  const t = track();
  const beat = 60 / 76;
  const chords = [
    ['F3', 'A3', 'C4', 'E4'],
    ['A3', 'C4', 'E4', 'G4'],
    ['A#3', 'D4', 'F4', 'A4'],
    ['C4', 'E4', 'G4', 'D5'],
  ];
  const bass = ['F2', 'A2', 'A#2', 'C3'];
  const order = [0, 1, 2, 3, 2, 1, 2, 3];
  for (let bar = 0; bar * 4 * beat < SECONDS; bar++) {
    const at = bar * 4 * beat;
    const ch = chords[bar % 4];
    add(t, at, epiano(freq(bass[bar % 4]), 3.2), 0.35);
    order.forEach((k, e) => add(t, at + e * beat * 0.5, epiano(freq(ch[k]), 2), 0.16, -0.4 + k * 0.25));
    for (let b = 0; b < 4; b++) add(t, at + b * beat, noise(0.04, 120, 0.95), 0.03, -0.3);
  }
  finish(t, 'gentle');
}

// "Bouncy": marimba arpeggios in G at 118 bpm, plucked bass, kick on every
// beat and a clap on 2 and 4.
function bouncy() {
  const t = track();
  const beat = 60 / 118;
  const chords = [
    ['G4', 'B4', 'D5', 'B4'],
    ['E4', 'G4', 'B4', 'G4'],
    ['C4', 'E4', 'G4', 'E4'],
    ['D4', 'F#4', 'A4', 'F#4'],
  ];
  const bass = ['G2', 'E2', 'C2', 'D2'];
  for (let bar = 0; bar * 4 * beat < SECONDS; bar++) {
    const at = bar * 4 * beat;
    const ch = chords[bar % 4];
    for (let s = 0; s < 16; s++) {
      if (s % 4 === 3 && bar % 2 === 0) continue;
      add(t, at + s * beat * 0.25, mallet(freq(ch[s % 4]), 0.7), s % 4 === 0 ? 0.2 : 0.13, s % 2 ? 0.3 : -0.3);
    }
    for (const b of [0, 1.5, 2, 3.5]) add(t, at + b * beat, pluck(freq(bass[bar % 4]), 0.8, 0.25), 0.45);
    for (let b = 0; b < 4; b++) add(t, at + b * beat, kick(0.25), 0.4);
    for (const b of [1, 3]) add(t, at + b * beat, noise(0.18, 25, 0.6, 3), 0.18);
  }
  finish(t, 'bouncy');
}

sunny();
gentle();
bouncy();
