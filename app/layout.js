import './globals.css';
import NumberInputWheelGuard from './_components/NumberInputWheelGuard';

// manifest.json (display: "standalone") + these icons/meta tags are what let
// a device "install" this as its own app — via the browser's install
// prompt on desktop, or Add to Home Screen on iOS/Android — so it opens in
// its own window/icon with no address bar or other tabs to switch away to,
// rather than living inside an ordinary browser tab.
export const metadata = {
  title: 'Europets Clinic — Management',
  description: 'Kind, caring, and compassionate veterinary care — clinic management for Europets',
  manifest: '/manifest.json',
  icons: {
    icon: ['/icons/icon-192.png', '/icons/icon-512.png'],
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Europets',
  },
};

export const viewport = {
  themeColor: '#e6186d',
};

// Deliberately bare: the internal staff nav lives in app/(admin)/layout.js,
// not here, so that routes outside that group — the client-facing
// hospitalization portal — never render it. This app has no login system,
// so that nav is effectively a list of links into every client's/patient's
// data; a client portal page must not carry it.
export default function RootLayout({ children }) {
  return (
    // en-GB (not en) nudges Chrome/Edge's native <input type="date"> picker
    // and its typed display toward day/month/year — the clinic's preferred
    // order. Not guaranteed on every browser (Firefox/Safari mostly key off
    // OS locale instead), but it's the only lever a page has over that.
    <html lang="en-GB">
      <body>
        <NumberInputWheelGuard />
        {children}
      </body>
    </html>
  );
}
