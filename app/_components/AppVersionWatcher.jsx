// app/_components/AppVersionWatcher.jsx
// Fixes the reason a Refresh button or a bookmarked/home-screen link
// doesn't reliably pick up a new deploy: reopening an installed icon (Add
// to Home Screen on iOS, Install app on Android), or coming back to an
// always-on desktop terminal that's been sitting on the same tab for
// hours, often doesn't do a fresh navigation at all. The OS/browser
// frequently resumes a previously-suspended copy straight from memory —
// no request, no Cache-Control header ever gets a chance to matter, and
// the JS actually running is whatever was loaded whenever the tab/icon was
// last cold-started. This is a well-known platform limitation (worst on
// iOS, which has no automatic update mechanism for home-screen web apps
// at all) — no Cache-Control header, service worker, or button-based
// reload can force a check that never happens because no network request
// happens.
//
// The fix: check anyway, using several signals that DO still fire without
// a real navigation:
//   - visibilitychange/pageshow/focus — fire when a frozen page is brought
//     back to the foreground, even without a real navigation
//   - a plain interval — covers a terminal that's simply left open and
//     never backgrounded/refocused at all, so none of the above ever fire
// — by making our own explicit fetch(..., { cache: 'no-store' }) call at
// that moment. A fetch's cache mode is honored far more reliably across
// mobile WebViews (and regular browsers) than a top-level page
// navigation's caching is, so this succeeds even in cases a manual
// refresh button's own navigation can't.
//
// Mounted in app/(admin)/layout.js and app/mobile/layout.js — the staff-
// facing surfaces, where an unannounced reload is a non-issue. Deliberately
// NOT in the bare root layout: the public client portal (app/portal) can
// have someone mid-way through filling in a form, where a surprise reload
// would lose their input — that side relies on the NO_STORE_HEADERS in
// next.config.js instead, which doesn't risk interrupting anything.

'use client';

import { useEffect, useRef } from 'react';

const CURRENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID;

// Guards against a reload loop if something's ever misconfigured (e.g. the
// endpoint flaps between two answers, or NEXT_PUBLIC_BUILD_ID somehow
// never matches what the endpoint reports) — sessionStorage survives the
// reload itself, so this really does cap it at one auto-reload per window
// rather than resetting every time.
const RELOAD_COOLDOWN_MS = 30000;
const LAST_RELOAD_KEY = 'europets_app_version_last_reload';

// A terminal that's simply left open, never backgrounded or refocused,
// never fires visibilitychange/pageshow/focus at all — this is the net
// for that case. Frequent enough to notice a new deploy within a coffee
// break, not so frequent it's a meaningful amount of traffic.
const POLL_INTERVAL_MS = 5 * 60 * 1000;

export default function AppVersionWatcher() {
  const checking = useRef(false);

  useEffect(() => {
    async function checkVersion() {
      if (checking.current || !CURRENT_BUILD_ID) return;
      checking.current = true;
      try {
        const res = await fetch(`/api/app-version?t=${Date.now()}`, { cache: 'no-store' });
        const data = await res.json();
        if (data.buildId && data.buildId !== CURRENT_BUILD_ID) {
          const lastReload = Number(sessionStorage.getItem(LAST_RELOAD_KEY) || 0);
          if (Date.now() - lastReload < RELOAD_COOLDOWN_MS) return;
          sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now()));
          const url = new URL(window.location.href);
          url.searchParams.set('_v', data.buildId);
          window.location.replace(url.toString());
        }
      } catch {
        // Offline, or the request failed — nothing to do; the next check
        // (event-driven or the interval below) tries again.
      } finally {
        checking.current = false;
      }
    }

    // visibilitychange fires on both the hide and show transitions — only
    // act on the show. pageshow and focus imply visibility by the nature
    // of the event, so they don't need that same guard (and gating them
    // on document.visibilityState here risks a race on some platforms
    // where the property hasn't flipped to "visible" yet at the instant
    // the event fires, silently skipping the check every single time).
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') checkVersion();
    }

    checkVersion();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', checkVersion);
    window.addEventListener('focus', checkVersion);
    const interval = setInterval(checkVersion, POLL_INTERVAL_MS);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', checkVersion);
      window.removeEventListener('focus', checkVersion);
      clearInterval(interval);
    };
  }, []);

  return null;
}
