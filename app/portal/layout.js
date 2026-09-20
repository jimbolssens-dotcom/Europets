// app/portal/layout.js
// Client-facing pages. Deliberately outside app/(admin) so none of the
// internal staff nav (links into every client's/patient's data — this app
// has no login system) ever renders here. noindex since these links are
// meant to be shared privately, one per hospitalization, not discovered.
//
// Loads the same "Hexfield" fonts as app/client-app/layout.js (unused
// unless a page below adds the .client-app class itself) so a page reached
// from inside the client app via ?app=1 — see app/portal/intake/[id] and
// app/portal/hospitalization/[id] — can pick up the app's own display/body/
// mono type instead of falling back to a system font when it goes dark.

import { Fraunces, Karla, Azeret_Mono } from 'next/font/google';

export const metadata = {
  robots: { index: false, follow: false },
};

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
});
const karla = Karla({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-body' });
const azeretMono = Azeret_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-mono' });

export default function PortalLayout({ children }) {
  return (
    <div className={`portal ${fraunces.variable} ${karla.variable} ${azeretMono.variable}`}>{children}</div>
  );
}
