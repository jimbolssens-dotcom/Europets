import './globals.css';

export const metadata = {
  title: 'Europets Clinic — Management',
  description: 'Kind, caring, and compassionate veterinary care — clinic management for Europets',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <nav className="topnav">
          <a href="/" className="brand">
            <img src="/logo.png" alt="Europets Clinic" />
          </a>
          <div className="topnav-links">
            <a href="/clients">Clients</a>
            <a href="/patients">Patients</a>
            <a href="/appointments">Appointments</a>
            <a href="/visits">Visits</a>
            <a href="/invoices">Invoices</a>
            <a href="/catalog">Catalog</a>
            <a href="/rooms">Rooms</a>
            <a href="/staff">Staff</a>
          </div>
        </nav>
        <main className="content">{children}</main>
      </body>
    </html>
  );
}
