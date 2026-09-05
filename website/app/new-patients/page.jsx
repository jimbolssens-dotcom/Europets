import { APP_URL, BOOKING_URL } from '@/lib/content';

export const metadata = { title: 'New Patients — Europets Clinic' };

export default function NewPatientsPage() {
  return (
    <div className="section">
      <div className="container new-patients-grid">
        <div>
          <span className="eyebrow">First visit?</span>
          <h1 className="page-title">Welcome to Europets</h1>
          <p className="page-lede">
            Registering before your visit means less time filling in forms in reception, and more time with the
            vet. It only takes a couple of minutes.
          </p>

          <ol className="steps-list">
            <li>
              <div>
                <strong>Register your details</strong>
                <span>Your info and your pet&apos;s — name, species, breed, and a bit of history.</span>
              </div>
            </li>
            <li>
              <div>
                <strong>Request an appointment</strong>
                <span>Pick a consult or standard procedure slot, or describe what you need if it&apos;s something else.</span>
              </div>
            </li>
            <li>
              <div>
                <strong>We confirm it</strong>
                <span>Our team reviews and confirms your booking, and you&apos;re all set.</span>
              </div>
            </li>
          </ol>

          <a href={BOOKING_URL} className="btn btn-primary">
            Start Registration
          </a>
        </div>

        <div className="card qr-card">
          <p className="qr-card-label">Or scan to register from your phone</p>
          {/* Generated live by the clinic app — always points at a fresh,
              one-time registration link, never a shared/reused one. */}
          <img src={`${APP_URL}/api/new-client-qr`} alt="QR code to register as a new patient" className="qr-image" />
        </div>
      </div>
    </div>
  );
}
