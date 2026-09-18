// app/_components/useClientAppSession.js
// Shared "who's logged in" state for the client-app pages (app/client-app/*)
// — same localStorage-remembers-who-you-picked pattern as the mobile staff
// app's MOBILE_STAFF_STORAGE_KEY (see app/mobile/page.js), just storing a
// client id instead of a staff id. See the security note in
// app/client-app/layout.js: this remembers a *choice*, it does not verify
// one — real verification (OTP) is a separate, not-yet-built step.

'use client';

import { useEffect, useState, useCallback } from 'react';

export const CLIENT_APP_STORAGE_KEY = 'europets_client_app_client_id';

export function useClientAppSession() {
  const [clientId, setClientId] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setClientId(localStorage.getItem(CLIENT_APP_STORAGE_KEY));
    setReady(true);
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
    localStorage.setItem(CLIENT_APP_STORAGE_KEY, id);
    setClientId(id);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(CLIENT_APP_STORAGE_KEY);
    setClientId(null);
  }, []);

  return { clientId, ready, login, logout };
}
