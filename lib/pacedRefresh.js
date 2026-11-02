// lib/pacedRefresh.js
// How often the always-open screens (the hospital and day-procedure walls,
// the hospital list, and the menu's hospital / cattery / messages alarms)
// re-load from the database.
//
// Supabase warned (2 Nov) that the project was using up its Disk IO budget.
// The database is only ~60 MB; the load was these screens. Every open tab
// re-loaded every 30-60 seconds, day and night, and re-loaded again on every
// single note saved anywhere, which came to ~150,000 requests a day. Jim:
// "slow it down even a lot more" when the clinic is closed.
//
// - Open (08:00-19:00 UAE): every 2 minutes.
// - Closed: every 15 minutes.
// - A tab nobody is looking at doesn't refresh at all; it catches up as soon
//   as it's shown again.
// - Live updates (a note saved, a patient moved) still show straight away,
//   but a burst of them becomes one reload instead of one per row.

import { clinicClosedAt } from './clinicHours.js';

export const OPEN_REFRESH_MS = 2 * 60 * 1000;
export const CLOSED_REFRESH_MS = 15 * 60 * 1000;
export const LIVE_UPDATE_DEBOUNCE_MS = 2000;

export function refreshDelayMs(now = Date.now(), { openMs = OPEN_REFRESH_MS, closedMs = CLOSED_REFRESH_MS } = {}) {
  return clinicClosedAt(now) ? Math.max(openMs, closedMs) : openMs;
}

// Runs `load` now, then on the pace above. Returns { trigger, stop }:
// pass `trigger` as the realtime handler, call `stop` in the effect cleanup.
// `env` is only for tests (timers, clock and a fake document).
export function startPacedRefresh(load, opts = {}, env = {}) {
  const setT = env.setTimeout || ((fn, ms) => setTimeout(fn, ms));
  const clearT = env.clearTimeout || ((t) => clearTimeout(t));
  const now = env.now || (() => Date.now());
  const doc = env.document !== undefined ? env.document : typeof document !== 'undefined' ? document : null;
  const debounceMs = opts.debounceMs ?? LIVE_UPDATE_DEBOUNCE_MS;

  let stopped = false;
  let lastRun = 0;
  let tickTimer = null;
  let liveTimer = null;
  let staleWhileHidden = false;

  const hidden = () => Boolean(doc && doc.visibilityState === 'hidden');

  const run = () => {
    if (stopped) return;
    lastRun = now();
    staleWhileHidden = false;
    try {
      const result = load();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // a failed refresh just waits for the next one
    }
  };

  const schedule = () => {
    if (stopped) return;
    clearT(tickTimer);
    tickTimer = setT(tick, refreshDelayMs(now(), opts));
  };

  function tick() {
    if (stopped) return;
    if (hidden()) staleWhileHidden = true;
    else run();
    schedule();
  }

  const trigger = () => {
    if (stopped) return;
    if (hidden()) {
      staleWhileHidden = true;
      return;
    }
    if (liveTimer) return; // one reload per burst
    liveTimer = setT(() => {
      liveTimer = null;
      run();
    }, debounceMs);
  };

  const onVisibility = () => {
    if (stopped || hidden()) return;
    if (staleWhileHidden || now() - lastRun >= refreshDelayMs(now(), opts)) {
      run();
      schedule();
    }
  };

  doc?.addEventListener?.('visibilitychange', onVisibility);
  run();
  schedule();

  return {
    trigger,
    stop() {
      stopped = true;
      clearT(tickTimer);
      clearT(liveTimer);
      doc?.removeEventListener?.('visibilitychange', onVisibility);
    },
  };
}
