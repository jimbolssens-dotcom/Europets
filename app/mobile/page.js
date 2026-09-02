// app/mobile/page.js
// Landing page for the phone-first recording app: two big taps in for
// voice recording (consult / hospitalization), plus a third for scanning
// a receipt straight into the accounting system.

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
      <a href="/mobile/scan-receipt" className="mobile-tile">
        <span className="mobile-tile-icon">🧾</span>
        <span>Scan Receipt</span>
        <span className="mobile-tile-hint">Photograph a supplier receipt to log it as an expense</span>
      </a>

      <p className="mobile-hint">
        Add this to your home screen for one-tap access: on iPhone, tap Share, then &quot;Add to
        Home Screen&quot;. On Android, tap the ⋮ menu, then &quot;Add to Home screen&quot; or
        &quot;Install app&quot;.
      </p>
    </div>
  );
}
