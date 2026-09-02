// app/mobile/page.js
// Landing page for the phone-first recording app: two big taps in, one
// for a consult recording, one for a hospitalization worksheet recording.

export default function MobileHomePage() {
  return (
    <div className="mobile-home">
      <img src="/logo.png" alt="Europets Clinic" className="mobile-logo" />
      <h1>Record</h1>
      <a href="/mobile/consults" className="mobile-tile">
        <span className="mobile-tile-icon">🎙️</span>
        <span>Consults</span>
        <span className="mobile-tile-hint">Today's appointments — tap a patient to record</span>
      </a>
      <a href="/mobile/hospitalization" className="mobile-tile">
        <span className="mobile-tile-icon">🏥</span>
        <span>Hospitalization</span>
        <span className="mobile-tile-hint">Admitted patients — tap one to record an observation</span>
      </a>
    </div>
  );
}
