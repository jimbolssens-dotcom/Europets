// app/client-app/layout.js
// The client-facing account app: a persistent, installable ("Add to Home
// Screen") app where a client logs in with their own phone number to see
// their pets, invoices, and appointments — distinct from the one-off
// magic-link app/portal pages (no login, one record per link) and from
// the internal app/mobile staff app (no login at all).
//
// SECURITY NOTE — read before opening this to the public: logging in here
// is currently just "type a phone number on file" (see page.js), with no
// verification that the person typing it is that client. That's fine
// while this stays reachable only by staff (still behind the general PIN
// gate in middleware.js — this route is deliberately NOT in
// PUBLIC_PATTERNS yet) for review/demo purposes, but it must NOT be
// opened to real clients until real verification (e.g. an OTP sent to
// that phone over WhatsApp/SMS) sits in front of it — otherwise anyone
// who knows or guesses a client's phone number could see their invoices,
// pets, and appointment history.
//
// The manifest/appleWebApp metadata below is what makes "Add to Home
// Screen" (iOS) / "Install app" (Android Chrome) produce a proper app
// icon that opens straight into /client-app in standalone mode — same
// mechanism as app/mobile/layout.js.
//
// Theme (dark "Hexfield" vs. the original plain light look) is a
// clinic-wide choice — clinic_settings.client_app_theme, migration 118,
// edited on the Settings page — not something each client picks. Read
// server-side here (so the very first paint, and the PWA install chrome's
// colors below, already match) and handed to ClientAppThemeProvider as
// the initial value; the provider re-checks client-side too in case staff
// change it while someone already has the app open.

import { cache } from 'react';
import { Fraunces, Karla, Azeret_Mono } from 'next/font/google';
import { supabase } from '@/lib/supabaseClient';
import AppVersionWatcher from '@/app/_components/AppVersionWatcher';
import ClientAppNav from '@/app/_components/ClientAppNav';
import { ClientAppThemeProvider } from '@/app/_components/ClientAppThemeContext';
import ClientAppShell from '@/app/_components/ClientAppShell';

// The three faces of the site's "Hexfield" brand direction — Fraunces for
// headings, Karla for body copy, Azeret Mono for the small uppercase
// eyebrow/mono labels. Self-hosted via next/font so the installed PWA
// doesn't depend on Google Fonts being reachable. See globals.css's
// "CLIENT APP" section for how these get used (dark theme only — the
// light theme falls back to system fonts, matching the original design).
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
});
const karla = Karla({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-body' });
const azeretMono = Azeret_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-mono' });

// Wrapped in React's cache() so generateMetadata/generateViewport/the
// layout body (all called for the same request) share one DB round trip
// instead of three.
const getClientAppTheme = cache(async () => {
  const { data } = await supabase.from('clinic_settings').select('client_app_theme').eq('id', true).maybeSingle();
  return data?.client_app_theme === 'light' ? 'light' : 'dark';
});

export async function generateMetadata() {
  return {
    robots: { index: false, follow: false },
    title: 'Europets — My Pets',
    manifest: '/client-app-manifest.json',
    appleWebApp: {
      capable: true,
      statusBarStyle: (await getClientAppTheme()) === 'light' ? 'default' : 'black-translucent',
      title: 'Europets',
    },
    icons: {
      apple: '/icon.png',
    },
  };
}

export async function generateViewport() {
  const theme = await getClientAppTheme();
  return {
    width: 'device-width',
    initialScale: 1,
    themeColor: theme === 'light' ? '#e6186d' : '#07060a',
  };
}

export default async function ClientAppLayout({ children }) {
  const theme = await getClientAppTheme();
  return (
    <div className={`${fraunces.variable} ${karla.variable} ${azeretMono.variable}`}>
      <ClientAppThemeProvider initialTheme={theme}>
        <ClientAppShell>
          <AppVersionWatcher />
          <div className="client-app-content">{children}</div>
          <ClientAppNav />
        </ClientAppShell>
      </ClientAppThemeProvider>
    </div>
  );
}
