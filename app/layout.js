import './globals.css';

export const metadata = {
  title: 'Europets — Clinic Management',
  description: 'Vet clinic management system for Europets',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <nav className="topnav">
          <a href="/" className="brand">Europets</a>
          <a href="/clients">Clients</a>
          <a href="/patients">Patients</a>
        </nav>
        <main className="content">{children}</main>
      </body>
    </html>
  );
}
