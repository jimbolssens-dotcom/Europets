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
//
// Who was last logged in on this phone is remembered too, so a page can
// start loading (and show its last copy, see useClientAppCache.js) at
// once instead of first waiting for the server to say who's logged in.
// The server's answer still decides: if it names nobody, or someone
// else, the remembered client and every saved copy are dropped, and the
// pages go back to the login screen as before. Logging out drops them
// too, so the next person on a shared phone never sees them.

'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { clearViewCachePrefix } from '@/lib/viewCache';

const REMEMBERED_KEY = 'europets-client-app-last-client';
export const CLIENT_APP_CACHE_PREFIX = 'europets-ca-v1:';

function readRemembered() {
  try {
    return window.localStorage.getItem(REMEMBERED_KEY) || null;
  } catch {
    return null;
  }
}

function remember(id) {
  try {
    if (id) window.localStorage.setItem(REMEMBERED_KEY, id);
    else window.localStorage.removeItem(REMEMBERED_KEY);
  } catch {
    // ignore
  }
}

// Switching who's on this phone: forget the last client's saved copies.
function switchRemembered(id) {
  if (readRemembered() !== id) clearViewCachePrefix(CLIENT_APP_CACHE_PREFIX);
  remember(id);
}

const ClientAppSessionContext = createContext(null);

export function ClientAppSessionProvider({ children }) {
  const [clientId, setClientId] = useState(null);
  const [ready, setReady] = useState(false);

  // Before the first paint: whoever was logged in here last.
  useLayoutEffect(() => {
    const remembered = readRemembered();
    if (remembered) {
      setClientId(remembered);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/client-app/auth/session')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const id = data?.clientId || null;
        switchRemembered(id);
        setClientId(id);
        setReady(true);
      })
      .catch(() => {
        // Offline or unreachable: keep the remembered client, if any.
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
    switchRemembered(id || null);
    setClientId(id);
  }, []);

  const logout = useCallback(() => {
    fetch('/api/client-app/auth/logout', { method: 'POST' }).catch(() => {});
    clearViewCachePrefix(CLIENT_APP_CACHE_PREFIX);
    remember(null);
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
