// app/_components/AppVersionWatcher.jsx
// Fixes the actual reason the mobile app's Refresh button (app/mobile/
// page.js) doesn't help once the icon is "installed" (Add to Home Screen
// on iOS, Install app on Android): reopening an installed icon often
// doesn't do a fresh navigation at all. The OS frequently resumes a
// previously-suspended copy straight from memory — no request, no
// Cache-Control header ever gets a chance to matter, and the JS actually
// running is whatever was loaded whenever the icon was last cold-started.
// This is a well-known platform limitation (worse on iOS, which has no
// automatic update mechanism for home-screen web apps at all) — no
// Cache-Control header, service worker, or button-based reload can force
// a check that never happens because no network request happens.
//
// The fix: check anyway, using a signal that DOES fire on that kind of
// resume — visibilitychange/pageshow/focus all fire when a frozen page is
// brought back to the foreground, even without a real navigation — by
// making our own explicit fetch(..., { cache: 'no-store' }) call at that
// moment. A fetch's cache mode is honored far more reliably across
// mobile WebViews than a top-level page navigation's caching is, so this
// succeeds even in cases the navigation-based refresh button can't.
// Detecting a mismatch force-reloads automatically — the whole point is
// this catches staleness the button never gets a chance to.

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

export default function AppVersionWatcher() {
  const checking = useRef(false);

  useEffect(() => {
    async function checkVersion() {
      if (checking.current || !CURRENT_BUILD_ID || document.visibilityState !== 'visible') return;
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
        // Offline, or the request failed — nothing to do; the next focus/
        // visibility event tries again.
      } finally {
        checking.current = false;
      }
    }

    checkVersion();
    document.addEventListener('visibilitychange', checkVersion);
    window.addEventListener('pageshow', checkVersion);
    window.addEventListener('focus', checkVersion);
    return () => {
      document.removeEventListener('visibilitychange', checkVersion);
      window.removeEventListener('pageshow', checkVersion);
      window.removeEventListener('focus', checkVersion);
    };
  }, []);

  return null;
}
