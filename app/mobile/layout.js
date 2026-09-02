// app/mobile/layout.js
// Staff-facing, phone-first pages for recording on the go: pick a
// consult from today's appointments or a cage from the hospitalization
// list, then just tap record. Deliberately outside app/(admin) — no
// desktop nav, single column, large tap targets — but still internal
// (this app has no login system, same as every other staff page).
//
// The manifest/appleWebApp metadata below is what makes "Add to Home
// Screen" (iOS) / "Install app" (Android Chrome) produce a proper app
// icon that opens straight into /mobile in standalone mode (no browser
// chrome), instead of just bookmarking whatever page the phone happened
// to be on. Scoped to this layout (not the root one) so it only applies
// under /mobile, not the desktop admin site or the client portal.

export const metadata = {
  robots: { index: false, follow: false },
  title: 'Europets — Record',
  manifest: '/mobile-manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Europets',
  },
  icons: {
    apple: '/icon.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#e6186d',
};

export default function MobileLayout({ children }) {
  return <div className="mobile-app">{children}</div>;
}
