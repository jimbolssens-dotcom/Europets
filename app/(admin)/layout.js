import SearchBox from '../_components/SearchBox';

// Wraps every internal staff page (everything except the public client
// portal under app/portal/) with the nav. Nested inside the bare root
// layout in app/layout.js.
export default function AdminLayout({ children }) {
  return (
    <>
      <nav className="topnav">
        <a href="/" className="brand">
          <img src="/logo.png" alt="Europets Clinic" />
        </a>
        <SearchBox />
        <div className="topnav-links">
          <a href="/clients">Clients</a>
          <a href="/patients">Patients</a>
          <a href="/intake">Intake</a>
          <a href="/appointments">Appointments</a>
          <a href="/consults">Consults</a>
          <a href="/hospitalization">Hospitalization</a>
          <a href="/vaccinations">Vaccinations</a>
          <a href="/invoices">Invoices</a>
          <a href="/accounting">Accounting</a>
          <a href="/catalog">Catalog</a>
          <a href="/mobile" title="Mobile recording app" aria-label="Mobile recording app" className="settings-link">
            📱
          </a>
          <a href="/shift-tally" title="Shift Tally" aria-label="Shift Tally" className="settings-link">
            💰
          </a>
          <a href="/settings" title="Settings" aria-label="Settings" className="settings-link">
            ⚙️
          </a>
        </div>
      </nav>
      <main className="content">{children}</main>
    </>
  );
}
