// app/_components/useClientAppSession.js
// Shared "who's logged in" state for the client-app pages (app/client-app/*).
// The actual session lives in an httpOnly cookie set by
// app/api/client-app/auth/{verify-code,select-account} once a WhatsApp
// one-time code checks out (see lib/clientAppAuth.js) — this hook just
// asks the server who that cookie belongs to on mount, and mirrors it in
// context so every page and the layout-level chrome (ClientAppNav,
// ClientAppSidebar) see the same state instead of each fetching and
// tracking it independently.
//
// Session state lives in ClientAppSessionProvider (mounted once in
// app/client-app/layout.js) rather than in this hook directly: with one
// fetch per call site, logging in on the page only updated *that*
// component's own copy of clientId — the layout's own ClientAppNav (and
// now ClientAppSidebar) kept their stale pre-login state indefinitely,
// since layout.js doesn't remount on client-side navigation within
// /client-app. A shared context means `login()` from anywhere updates
// every consumer at once.

'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ClientAppSessionContext = createContext(null);

export function ClientAppSessionProvider({ children }) {
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

  // Fire-and-forget "still using the app" signal — fires once per client
  // per session (not once per page view now that this state is shared).
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

  return (
    <ClientAppSessionContext.Provider value={{ clientId, ready, login, logout }}>
      {children}
    </ClientAppSessionContext.Provider>
  );
}

export function useClientAppSession() {
  const ctx = useContext(ClientAppSessionContext);
  if (!ctx) {
    throw new Error('useClientAppSession must be used within ClientAppSessionProvider');
  }
  return ctx;
}
