import './globals.css';

export const metadata = {
  title: 'Europets Clinic — Management',
  description: 'Kind, caring, and compassionate veterinary care — clinic management for Europets',
};

// Deliberately bare: the internal staff nav lives in app/(admin)/layout.js,
// not here, so that routes outside that group — the client-facing
// hospitalization portal — never render it. This app has no login system,
// so that nav is effectively a list of links into every client's/patient's
// data; a client portal page must not carry it.
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
