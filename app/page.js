export default function HomePage() {
  return (
    <div>
      <h1>Europets Clinic</h1>
      <p>Manage clients, patients, and appointments. Visits and invoicing land in later phases.</p>
      <div className="home-links">
        <a href="/clients">Clients</a>
        <a href="/patients">Patients</a>
        <a href="/appointments">Appointments</a>
        <a href="/rooms">Rooms</a>
        <a href="/staff">Staff</a>
      </div>
    </div>
  );
}
