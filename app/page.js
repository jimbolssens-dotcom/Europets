export default function HomePage() {
  return (
    <div>
      <h1>Europets Clinic</h1>
      <p>Manage clients, patients, appointments, live visits, and invoicing.</p>
      <div className="home-links">
        <a href="/clients">Clients</a>
        <a href="/patients">Patients</a>
        <a href="/appointments">Appointments</a>
        <a href="/visits">Visits</a>
        <a href="/invoices">Invoices</a>
        <a href="/catalog">Catalog</a>
        <a href="/rooms">Rooms</a>
        <a href="/staff">Staff</a>
      </div>
    </div>
  );
}
