export default function HomePage() {
  return (
    <div>
      <p className="tagline">Kind, caring, and compassionate veterinary care</p>
      <h1>Europets Clinic</h1>
      <p>Manage clients, patients, appointments, consults, hospitalization, and invoicing.</p>
      <div className="home-links">
        <a href="/clients">Clients</a>
        <a href="/patients">Patients</a>
        <a href="/appointments">Appointments</a>
        <a href="/consults">Consults</a>
        <a href="/hospitalization">Hospitalization</a>
        <a href="/invoices">Invoices</a>
        <a href="/catalog">Catalog</a>
        <a href="/settings">⚙️ Settings</a>
      </div>
    </div>
  );
}
