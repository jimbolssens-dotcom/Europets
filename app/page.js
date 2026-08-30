export default function HomePage() {
  return (
    <div>
      <h1>Europets Clinic</h1>
      <p>Manage clients, patients, appointments, and live visits. Invoicing lands in a later phase.</p>
      <div className="home-links">
        <a href="/clients">Clients</a>
        <a href="/patients">Patients</a>
        <a href="/appointments">Appointments</a>
        <a href="/visits">Visits</a>
        <a href="/rooms">Rooms</a>
        <a href="/staff">Staff</a>
      </div>
    </div>
  );
}
