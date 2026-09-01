import './globals.css';
import SearchBox from './_components/SearchBox';

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
          <SearchBox />
          <div className="topnav-links">
            <a href="/clients">Clients</a>
            <a href="/patients">Patients</a>
            <a href="/appointments">Appointments</a>
            <a href="/consults">Consults</a>
            <a href="/hospitalization">Hospitalization</a>
            <a href="/invoices">Invoices</a>
            <a href="/catalog">Catalog</a>
            <a href="/settings">Settings</a>
          </div>
        </nav>
        <main className="content">{children}</main>
      </body>
    </html>
  );
}
