// app/_components/useClientAppSession.js
// Shared "who's logged in" state for the client-app pages (app/client-app/*).
// The actual session lives in an httpOnly cookie set by
// app/api/client-app/auth/{verify-code,select-account} once a WhatsApp
// one-time code checks out (see lib/clientAppAuth.js) — this hook just
// asks the server who that cookie belongs to on mount, and mirrors it in
// local state so pages don't all have to await that fetch themselves.
// `login()` doesn't set the cookie itself (the auth routes already did,
// via their response) — it just lets the page that just finished the OTP
// flow update this state immediately instead of waiting on a fresh
// GET .../session round trip.

'use client';

import { useEffect, useState, useCallback } from 'react';

export function useClientAppSession() {
  const [clientId, setClientId] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/client-app/auth/session')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setClientId(data?.clientId || null);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fire-and-forget "still using the app" signal — every client-app page
  // mounts this hook, so this fires once per page view. Lets staff tell,
  // e.g. when deciding how to send a consent form, whether this client
  // actually has the app rather than just having it in their history once.
  useEffect(() => {
    if (!ready || !clientId) return;
    fetch(`/api/clients/${clientId}/app-seen`, { method: 'POST' }).catch(() => {});
  }, [ready, clientId]);

  const login = useCallback((id) => {
    setClientId(id);
  }, []);

  const logout = useCallback(() => {
    fetch('/api/client-app/auth/logout', { method: 'POST' }).catch(() => {});
    setClientId(null);
  }, []);

  return { clientId, ready, login, logout };
}
