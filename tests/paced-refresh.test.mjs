import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshDelayMs, startPacedRefresh, OPEN_REFRESH_MS, CLOSED_REFRESH_MS } from '../lib/pacedRefresh.js';

// UAE is UTC+4: 10:00 UAE = 06:00Z (open), 23:00 UAE = 19:00Z (closed).
const OPEN = Date.parse('2026-11-02T06:00:00Z');
const CLOSED = Date.parse('2026-11-02T19:00:00Z');

function fakeEnv(start) {
  let clock = start;
  let timers = [];
  let seq = 0;
  const listeners = {};
  const doc = {
    visibilityState: 'visible',
    addEventListener: (e, fn) => { listeners[e] = fn; },
    removeEventListener: (e) => { delete listeners[e]; },
  };
  return {
    env: {
      now: () => clock,
      setTimeout: (fn, ms) => { const id = ++seq; timers.push({ id, at: clock + ms, fn }); return id; },
      clearTimeout: (id) => { timers = timers.filter((t) => t.id !== id); },
      document: doc,
    },
    advance(ms) {
      const end = clock + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (!next || next.at > end) break;
        timers.shift();
        clock = next.at;
        next.fn();
      }
      clock = end;
    },
    setHidden(h) {
      doc.visibilityState = h ? 'hidden' : 'visible';
      listeners.visibilitychange?.();
    },
  };
}

test('2 minutes while open, 15 minutes while closed', () => {
  assert.equal(refreshDelayMs(OPEN), OPEN_REFRESH_MS);
  assert.equal(refreshDelayMs(CLOSED), CLOSED_REFRESH_MS);
  assert.equal(OPEN_REFRESH_MS, 2 * 60 * 1000);
  assert.equal(CLOSED_REFRESH_MS, 15 * 60 * 1000);
});

test('loads at once, then on the open pace', () => {
  const f = fakeEnv(OPEN);
  let n = 0;
  const p = startPacedRefresh(() => { n++; }, {}, f.env);
  assert.equal(n, 1);
  f.advance(60 * 1000);
  assert.equal(n, 1);
  f.advance(60 * 1000);
  assert.equal(n, 2);
  f.advance(10 * 60 * 1000);
  assert.equal(n, 7);
  p.stop();
  f.advance(60 * 60 * 1000);
  assert.equal(n, 7);
});

test('a closed night is 4 refreshes an hour, not 60-120', () => {
  const f = fakeEnv(CLOSED);
  let n = 0;
  startPacedRefresh(() => { n++; }, {}, f.env);
  f.advance(60 * 60 * 1000);
  assert.equal(n, 1 + 4);
});

test('a burst of live updates becomes one reload', () => {
  const f = fakeEnv(OPEN);
  let n = 0;
  const p = startPacedRefresh(() => { n++; }, {}, f.env);
  for (let i = 0; i < 10; i++) p.trigger();
  f.advance(1000);
  assert.equal(n, 1);
  f.advance(1500);
  assert.equal(n, 2);
});

test('a hidden tab does nothing, then catches up when shown', () => {
  const f = fakeEnv(OPEN);
  let n = 0;
  const p = startPacedRefresh(() => { n++; }, {}, f.env);
  f.setHidden(true);
  f.advance(30 * 60 * 1000);
  p.trigger();
  f.advance(5000);
  assert.equal(n, 1);
  f.setHidden(false);
  assert.equal(n, 2);
});

test('showing a tab that refreshed recently does not reload again', () => {
  const f = fakeEnv(OPEN);
  let n = 0;
  startPacedRefresh(() => { n++; }, {}, f.env);
  f.setHidden(true);
  f.advance(10 * 1000);
  f.setHidden(false);
  assert.equal(n, 1);
});

test('a failing load does not stop the refreshes', () => {
  const f = fakeEnv(OPEN);
  let n = 0;
  startPacedRefresh(() => { n++; return Promise.reject(new Error('offline')); }, {}, f.env);
  f.advance(4 * 60 * 1000);
  assert.equal(n, 3);
});
