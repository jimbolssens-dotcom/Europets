// app/_components/ClientAppThemeContext.js
// The client-app's theme is a clinic-wide setting (clinic_settings.
// client_app_theme, migration 118 — edited on the Settings page), not
// something each client picks for themselves. ClientAppThemeProvider
// fetches it once and makes it available to every client-app page/
// component via this context, so HexIcon/EcgLine/the login hero can each
// render their dark-hex or plain-light version without every call site
// having to fetch the setting itself.

'use client';

import { createContext, useContext, useEffect, useState } from 'react';

const ClientAppThemeContext = createContext('dark');

export function ClientAppThemeProvider({ children, initialTheme = 'dark' }) {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/clinic-settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && (data?.client_app_theme === 'light' || data?.client_app_theme === 'dark')) {
          setTheme(data.client_app_theme);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return <ClientAppThemeContext.Provider value={theme}>{children}</ClientAppThemeContext.Provider>;
}

export function useClientAppTheme() {
  return useContext(ClientAppThemeContext);
}
