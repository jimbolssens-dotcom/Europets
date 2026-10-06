// app/client-app/page.js
// Client-app landing page: a phone-number + WhatsApp-code login screen if
// nobody's logged in on this device yet, otherwise a dashboard — greeting,
// an alert if any of the client's pets is currently admitted (linking
// straight to the existing public portal status page for it), and quick
// links to the rest of the app. See useClientAppSession for what "logged
// in" means here (a session cookie set once the code checks out — see
// lib/clientAppAuth.js) and app/client-app/layout.js for what's still
// needed before this is safe to open up beyond staff testing.

'use client';

import { useEffect, useState } from 'react';
import { useClientAppSession } from '@/app/_components/useClientAppSession';
import { useClientAppTheme } from '@/app/_components/ClientAppThemeContext';
import ClientAppPushOptIn from '@/app/_components/ClientAppPushOptIn';
import HexIcon from '@/app/_components/HexIcon';
import HexfieldCanvas from '@/app/_components/HexfieldCanvas';
import EcgLine from '@/app/_components/EcgLine';
import { dueStatus, formatDate } from '@/lib/vaccinationDueStatus';
import { normalizePhoneDigits } from '@/lib/clientPhoneDigits';
import { money, balanceDue, invoiceLabel } from '@/lib/paymentReminders';
import { reportPdfHref } from '@/lib/clientAppReports';
import { formatShortDate } from '@/lib/formatTimestamp';

const APPOINTMENT_TYPE_LABEL = {
  consult: 'Consult',
  video: 'Video consult',
  surgery: 'Surgery',
};

function formatApptWhen(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function ClientAppHomePage() {
  const { clientId, ready, login, logout } = useClientAppSession();
  const theme = useClientAppTheme();
  const [phoneInput, setPhoneInput] = useState('+971 ');
  const [codeInput, setCodeInput] = useState('');
  const [step, setStep] = useState('phone'); // 'phone' | 'code' | 'picker'
  const [phoneDigits, setPhoneDigits] = useState('');
  const [verifiedPhoneToken, setVerifiedPhoneToken] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [matches, setMatches] = useState(null);
  // Set only while WhatsApp sending isn't configured yet (see
  // app/api/client-app/auth/request-code/route.js) — shows the code
  // directly instead of leaving no way to log in.
  const [devCode, setDevCode] = useState(null);

  const [client, setClient] = useState(null);
  const [openAdmissions, setOpenAdmissions] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [consentRequests, setConsentRequests] = useState([]);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [videoBookingLoading, setVideoBookingLoading] = useState(false);
  const [videoBookingError, setVideoBookingError] = useState(null);

  // Below here is only rendered by the desktop-width overview (see
  // .client-app-desktop-overview) — the mobile dashboard doesn't need any
  // of it, but it's cheap to fetch alongside everything else above rather
  // than add a second viewport-gated data-fetching path.
  const [pets, setPets] = useState([]);
  const [nextAppointment, setNextAppointment] = useState(null);
  const [nextDueVaccine, setNextDueVaccine] = useState(null);
  const [latestInvoice, setLatestInvoice] = useState(null);
  const [recentReports, setRecentReports] = useState([]);
  const [latestMessage, setLatestMessage] = useState(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState(null);

  useEffect(() => {
    if (!ready || !clientId) return;
    let cancelled = false;
    setLoadingDashboard(true);
    Promise.all([
      fetch(`/api/clients/${clientId}`).then((res) => (res.ok ? res.json() : null)),
      fetch(`/api/hospitalizations?client_id=${clientId}&status=admitted`).then((res) =>
        res.ok ? res.json() : []
      ),
      fetch(`/api/patients?client_id=${clientId}`).then((res) => (res.ok ? res.json() : [])),
      fetch(`/api/appointments?client_id=${clientId}`).then((res) => (res.ok ? res.json() : [])),
      fetch(`/api/consent-form-requests?client_id=${clientId}`).then((res) => (res.ok ? res.json() : [])),
      fetch(`/api/invoices?client_id=${clientId}`).then((res) => (res.ok ? res.json() : [])),
    ])
      .then(async ([clientData, admissions, pets, appointments, pendingConsentForms, invoices]) => {
        if (cancelled) return;
        if (!clientData) {
          // Stale/deleted id on this phone — send them back to the login screen.
          logout();
          return;
        }
        setClient(clientData);
        setOpenAdmissions(Array.isArray(admissions) ? admissions : []);
        setConsentRequests(Array.isArray(pendingConsentForms) ? pendingConsentForms : []);
        setPets(Array.isArray(pets) ? pets : []);

        const latestInv = (Array.isArray(invoices) ? invoices : [])
          .filter((inv) => inv.status !== 'void')
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        setLatestInvoice(latestInv || null);

        // Reminders banner: vaccines due (or overdue) across every pet
        // within the same 30-day "due soon" window dueStatus already
        // uses, plus the next appointment if it's within a week — the
        // same underlying data the Vaccinations Due section and
        // Appointments tab already show, just surfaced here as one
        // combined "things to act on" list.
        const petList = Array.isArray(pets) ? pets : [];
        const dueByPet = await Promise.all(
          petList.map((pet) =>
            fetch(`/api/vaccinations?patient_id=${pet.id}&due=true&within_days=30`)
              .then((res) => (res.ok ? res.json() : []))
              .then((rows) => rows.map((r) => ({ ...r, petName: pet.name, petId: pet.id })))
          )
        );
        if (cancelled) return;
        const dueVaccines = dueByPet
          .flat()
          .sort((a, b) => new Date(a.next_due_date) - new Date(b.next_due_date));
        setNextDueVaccine(dueVaccines[0] || null);

        const now = Date.now();
        const weekOut = now + 7 * 24 * 60 * 60 * 1000;
        // The full next-upcoming-appointment (no 7-day cutoff) — for the
        // desktop overview's "Next Appointment" stat card, which should
        // show what's booked even if it's weeks out, unlike the reminders
        // banner below (only surfaces what's coming up imminently).
        const trueNextAppt = (Array.isArray(appointments) ? appointments : [])
          .filter((a) => a.status !== 'cancelled' && new Date(a.start_time).getTime() >= now)
          .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];
        setNextAppointment(trueNextAppt || null);
        const upcomingAppt = trueNextAppt && new Date(trueNextAppt.start_time).getTime() <= weekOut ? trueNextAppt : null;

        const items = dueVaccines.map((v) => {
          const status = dueStatus(v.next_due_date);
          return {
            key: `vax-${v.id}`,
            icon: '💉',
            text: `${v.vaccine_name} ${
              status?.className === 'error' ? 'is overdue' : `due ${formatDate(v.next_due_date)}`
            } for ${v.petName}`,
            href: `/client-app/pets/${v.petId}`,
          };
        });
        if (upcomingAppt) {
          items.push({
            key: `appt-${upcomingAppt.id}`,
            icon: '📅',
            text: `${APPOINTMENT_TYPE_LABEL[upcomingAppt.type] || 'Appointment'} ${formatApptWhen(
              upcomingAppt.start_time
            )} for ${upcomingAppt.patients?.name || 'your pet'}`,
            href: '/client-app/appointments',
          });
        }
        setReminders(items);
      })
      .finally(() => !cancelled && setLoadingDashboard(false));
    return () => {
      cancelled = true;
    };
  }, [ready, clientId, logout]);

  // Desktop overview only (see .client-app-desktop-overview) — needs
  // `pets` from the effect above first, so it's a separate effect rather
  // than folded into the Promise.all up there.
  useEffect(() => {
    if (!ready || !clientId || pets.length === 0) return;
    let cancelled = false;
    Promise.all(
      pets.map((pet) =>
        fetch(`/api/patients/${pet.id}/report-overview`)
          .then((res) => (res.ok ? res.json() : []))
          .then((rows) => rows.map((r) => ({ ...r, petName: pet.name })))
      )
    ).then((byPet) => {
      if (cancelled) return;
      const merged = byPet
        .flat()
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
        .slice(0, 4);
      setRecentReports(merged);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, clientId, pets]);

  useEffect(() => {
    if (!ready || !clientId) return;
    let cancelled = false;
    fetch(`/api/clients/${clientId}/messages`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setLatestMessage(list[list.length - 1] || null);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, clientId]);

  // Same "start a fresh intake request, open its portal link" flow as
  // Appointments' own "Book a New Appointment" — the desktop overview's
  // generic "Book an appointment" button (unlike startVideoBooking below,
  // this doesn't pre-set a type).
  async function startBooking() {
    setBookingError(null);
    setBookingLoading(true);
    try {
      const res = await fetch('/api/intake-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not start booking — please try again.');
      window.location.href = `/portal/intake/${data.id}?app=1`;
    } catch (err) {
      setBookingError(err.message);
      setBookingLoading(false);
    }
  }

  async function handlePhoneSubmit(e) {
    e.preventDefault();
    const digits = normalizePhoneDigits(phoneInput);
    if (digits.length < 12) {
      setError('Enter a valid phone number.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/client-app/auth/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      setPhoneDigits(digits);
      setCodeInput('');
      setDevCode(data.devCode || null);
      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCodeSubmit(e) {
    e.preventDefault();
    if (!codeInput.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/client-app/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneDigits, code: codeInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Invalid code.');
      if (data.clientId) {
        login(data.clientId);
      } else {
        setMatches(data.matches);
        setVerifiedPhoneToken(data.verifiedPhoneToken);
        setStep('picker');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePickAccount(id) {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/client-app/auth/select-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verifiedPhoneToken, clientId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      login(data.clientId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function resetToPhoneStep() {
    setStep('phone');
    setError('');
    setMatches(null);
    setCodeInput('');
    setVerifiedPhoneToken(null);
    setDevCode(null);
  }

  // Same "start a fresh intake request, open its portal link" flow as
  // Appointments' own "Book a New Appointment" (app/client-app/appointments)
  // — just pre-set to a video consult via ?type=video (see the matching
  // effect on app/portal/intake/[id]). A client can never start a call
  // outright from here: this only ever requests a slot, which still goes
  // through the normal staff approval/scheduling step like any other
  // appointment request.
  async function startVideoBooking() {
    setVideoBookingError(null);
    setVideoBookingLoading(true);
    try {
      const res = await fetch('/api/intake-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not start booking — please try again.');
      window.location.href = `/portal/intake/${data.id}?app=1&type=video`;
    } catch (err) {
      setVideoBookingError(err.message);
      setVideoBookingLoading(false);
    }
  }

  if (!ready) return null;

  if (!clientId) {
    const loginForm =
      step === 'phone' ? (
        <form onSubmit={handlePhoneSubmit} className="client-app-login-form">
          <input
            type="tel"
            inputMode="tel"
            placeholder="+971 50 123 4567"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            className="client-app-login-input"
            autoFocus
          />
          <button type="submit" disabled={submitting}>
            {submitting ? 'Sending code...' : 'Send code'}
          </button>
        </form>
      ) : step === 'code' ? (
        <form onSubmit={handleCodeSubmit} className="client-app-login-form">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            className="client-app-login-input"
            autoFocus
          />
          <button type="submit" disabled={submitting}>
            {submitting ? 'Verifying...' : 'Verify'}
          </button>
        </form>
      ) : null;

    return (
      <div className="mobile-page client-app-login">
        <a
          href={process.env.NEXT_PUBLIC_WEBSITE_URL || 'https://epc.vet'}
          className="client-app-website-link"
        >
          ← Back to website
        </a>
        {theme === 'light' ? (
          <>
            <div className="mobile-heading-row">
              <img src="/logo.png" alt="Europets Clinic" className="mobile-home-logo" />
            </div>
            <p className="mobile-subtitle client-app-login-intro">
              {step === 'code'
                ? `Enter the code sent to your WhatsApp.`
                : 'Enter the phone number on file with the clinic to see your pets, invoices, and appointments.'}
            </p>
            {step === 'phone' && (
              <p className="client-app-login-note">
                This must be the WhatsApp number the clinic has on file for you — that&apos;s where your
                code goes. Can&apos;t log in? Contact the clinic to confirm or update the number on your
                account.
              </p>
            )}
            {step === 'code' && devCode && (
              <p className="client-app-dev-code-hint">
                WhatsApp sending isn&apos;t configured yet — your code is <strong>{devCode}</strong>
              </p>
            )}
            {loginForm}
            {step === 'code' && (
              <button type="button" className="mobile-link-btn" onClick={resetToPhoneStep}>
                Change number
              </button>
            )}
          </>
        ) : (
          <>
            <div className="client-app-hero">
              <HexfieldCanvas />
              <div className="client-app-hero-content">
                <div className="mobile-heading-row">
                  <img src="/logo.png" alt="Europets Clinic" className="mobile-home-logo" />
                </div>
                <p className="client-app-login-eyebrow">Client Portal</p>
                <p className="mobile-subtitle client-app-login-intro">
                  {step === 'code'
                    ? `Enter the code sent to your WhatsApp.`
                    : 'Enter the phone number on file with the clinic to see your pets, invoices, and appointments.'}
                </p>
                {step === 'phone' && (
                  <p className="client-app-login-note">
                    This must be the WhatsApp number the clinic has on file for you — that&apos;s where
                    your code goes. Can&apos;t log in? Contact the clinic to confirm or update the number
                    on your account.
                  </p>
                )}
                {step === 'code' && devCode && (
                  <p className="client-app-dev-code-hint">
                    WhatsApp sending isn&apos;t configured yet — your code is <strong>{devCode}</strong>
                  </p>
                )}
                {loginForm}
                {step === 'code' && (
                  <button type="button" className="mobile-link-btn" onClick={resetToPhoneStep}>
                    Change number
                  </button>
                )}
              </div>
            </div>
            <EcgLine />
          </>
        )}
        {step === 'picker' && matches && (
          <>
            <p className="mobile-subtitle">A few accounts share that number — which one is you?</p>
            <ul className="mobile-list">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="mobile-list-item"
                    onClick={() => handlePickAccount(m.id)}
                    disabled={submitting}
                  >
                    <span className="mobile-list-title">{m.full_name}</span>
                    <span className="mobile-list-meta">Client #{m.client_number}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="mobile-link-btn" onClick={resetToPhoneStep}>
              Use a different number
            </button>
          </>
        )}
        {error && <p className="client-app-login-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mobile-page client-app-home">
      <div className="mobile-heading-row">
        <img src="/logo.png" alt="Europets Clinic" className="mobile-home-logo" />
        <span className="mobile-greeting">Hello, {client?.full_name?.split(' ')[0] || 'there'}!</span>
      </div>

      {theme === 'dark' && <EcgLine />}

      <ClientAppPushOptIn />

      {!loadingDashboard && openAdmissions.length > 0 && (
        <div className="client-app-admission-alert">
          {openAdmissions.map((h) => (
            <a key={h.id} href={`/portal/hospitalization/${h.id}?app=1`} className="client-app-admission-alert-link">
              <HexIcon>🏥</HexIcon>
              <span>{h.patients?.name || 'Your pet'} is currently at the clinic — tap for updates</span>
            </a>
          ))}
        </div>
      )}

      {!loadingDashboard && consentRequests.length > 0 && (
        <>
          <p className="mobile-section-header">Consent Forms to Sign</p>
          <ul className="mobile-list">
            {consentRequests.map((req) => (
              <li key={req.id}>
                <a href={`/client-app/consent/${req.id}`} className="mobile-list-item">
                  <span className="mobile-list-title">
                    📝 {req.form_label}
                    {req.patient_name ? ` for ${req.patient_name}` : ''}
                  </span>
                  <span className="mobile-list-meta">Tap to review and sign</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Mobile: reminders banner + the 6-tile quick-link grid. Hidden at
          desktop widths in favor of .client-app-desktop-overview below —
          see the .client-app-mobile-only / .client-app-desktop-overview
          rules in globals.css. */}
      <div className="client-app-mobile-only">
        {!loadingDashboard && reminders.length > 0 && (
          <>
            <p className="mobile-section-header">Reminders</p>
            <ul className="mobile-list">
              {reminders.map((item) => (
                <li key={item.key}>
                  <a href={item.href} className="mobile-list-item">
                    <span className="mobile-list-title">
                      {item.icon} {item.text}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mobile-square-tiles">
          <a href="/client-app/pets" className="mobile-square-tile">
            <HexIcon>🐾</HexIcon>
            <span>My Pets</span>
          </a>
          <a href="/client-app/reports" className="mobile-square-tile">
            <HexIcon>🩻</HexIcon>
            <span>Reports</span>
          </a>
          <a href="/client-app/invoices" className="mobile-square-tile">
            <HexIcon>🧾</HexIcon>
            <span>Invoices</span>
          </a>
          <a href="/client-app/appointments" className="mobile-square-tile">
            <HexIcon>📅</HexIcon>
            <span>Appointments</span>
          </a>
          <a href="/client-app/messages" className="mobile-square-tile">
            <HexIcon>💬</HexIcon>
            <span>Messages</span>
          </a>
          <a href="/client-app/cattery" className="mobile-square-tile">
            <HexIcon>🐱</HexIcon>
            <span>Cattery</span>
          </a>
          <button
            type="button"
            className="mobile-square-tile"
            onClick={startVideoBooking}
            disabled={videoBookingLoading}
          >
            <HexIcon>🎥</HexIcon>
            <span>{videoBookingLoading ? 'Opening…' : 'Video Consult'}</span>
          </button>
        </div>
        {videoBookingError && <p className="client-app-login-error">{videoBookingError}</p>}

        <p className="mobile-hint">
          Add this to your home screen for one-tap access: on iPhone, tap Share, then &quot;Add to Home
          Screen&quot;. On Android, tap the ⋮ menu, then &quot;Add to Home screen&quot; or &quot;Install
          app&quot;.
        </p>
      </div>

      {/* Desktop: a proper dashboard — see app/_components/ClientAppSidebar
          for the nav this pairs with. Same data as the mobile view above,
          just laid out for a wide screen instead of squeezed into a
          single column of tiles. */}
      <div className="client-app-desktop-overview">
        <div className="client-app-overview-header">
          <div>
            <p className="client-app-overview-eyebrow">
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase()}
            </p>
            <h2 className="client-app-overview-heading">
              Welcome back, <span>{client?.full_name?.split(' ')[0] || 'there'}</span>
            </h2>
          </div>
          <button type="button" className="client-app-cta-btn" onClick={startBooking} disabled={bookingLoading}>
            {bookingLoading ? 'Opening…' : 'Book an appointment'}
          </button>
        </div>
        {bookingError && <p className="client-app-login-error">{bookingError}</p>}

        {!loadingDashboard && (
          <div className="client-app-overview-stats">
            <div className="client-app-stat-card">
              <p className="client-app-stat-label">Next Appointment</p>
              {nextAppointment ? (
                <>
                  <p className="client-app-stat-value">{formatApptWhen(nextAppointment.start_time)}</p>
                  <p className="client-app-stat-meta">
                    {APPOINTMENT_TYPE_LABEL[nextAppointment.type] || 'Appointment'}
                    {nextAppointment.staff?.full_name ? ` with ${nextAppointment.staff.full_name}` : ''}
                  </p>
                </>
              ) : (
                <p className="client-app-stat-meta">Nothing booked yet</p>
              )}
            </div>
            <div className="client-app-stat-card">
              <p className="client-app-stat-label">Vaccine Due Soon</p>
              {nextDueVaccine ? (
                <>
                  <p className="client-app-stat-value client-app-stat-value-accent">
                    {nextDueVaccine.vaccine_name} — {nextDueVaccine.petName}
                  </p>
                  <p className="client-app-stat-meta">
                    {dueStatus(nextDueVaccine.next_due_date)?.className === 'error'
                      ? 'Overdue'
                      : `Due ${formatDate(nextDueVaccine.next_due_date)}`}
                  </p>
                </>
              ) : (
                <p className="client-app-stat-meta">All up to date</p>
              )}
            </div>
            <div className="client-app-stat-card">
              <p className="client-app-stat-label">Latest Invoice</p>
              {latestInvoice ? (
                <>
                  <p className="client-app-stat-value">AED {money(latestInvoice.total)}</p>
                  <p
                    className={`client-app-stat-meta${
                      latestInvoice.status === 'paid' ? ' client-app-stat-meta-good' : ''
                    }`}
                  >
                    {latestInvoice.status === 'paid'
                      ? `Paid · ${formatShortDate(latestInvoice.created_at)}`
                      : `AED ${money(balanceDue(latestInvoice))} due`}
                  </p>
                </>
              ) : (
                <p className="client-app-stat-meta">No invoices yet</p>
              )}
            </div>
          </div>
        )}

        <div className="client-app-overview-panels">
          <div className="client-app-overview-panel">
            <div className="client-app-overview-panel-header">
              <p>Your Pets</p>
              <a href="/client-app/pets">View all →</a>
            </div>
            {pets.length === 0 ? (
              <p className="mobile-subtitle">No pets on file yet.</p>
            ) : (
              <div className="client-app-overview-pets">
                {pets
                  .filter((pet) => !pet.deceased && !pet.rehomed)
                  .slice(0, 4)
                  .map((pet) => (
                    <a key={pet.id} href={`/client-app/pets/${pet.id}`} className="client-app-overview-pet-chip">
                      {pet.profile_photo_url ? (
                        <img src={pet.profile_photo_url} alt="" className="client-app-pet-avatar-sm" />
                      ) : (
                        <HexIcon>🐾</HexIcon>
                      )}
                      <div>
                        <span className="client-app-overview-pet-name">{pet.name}</span>
                        <span className="client-app-overview-pet-meta">
                          {[pet.species, pet.breed].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    </a>
                  ))}
              </div>
            )}
            {recentReports.length > 0 && (
              <>
                <p className="client-app-overview-subheader">Recent Reports</p>
                <ul className="client-app-overview-reports">
                  {recentReports.map((row) => {
                    const href = reportPdfHref(row);
                    const Tag = href ? 'a' : 'div';
                    return (
                      <li key={row.id}>
                        <Tag {...(href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {})}>
                          <span>
                            {row.kind} — {row.petName}
                          </span>
                          <span>{row.date ? formatShortDate(row.date) : 'Undated'}</span>
                        </Tag>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          <div className="client-app-overview-panel">
            <div className="client-app-overview-panel-header">
              <p>Messages</p>
            </div>
            {latestMessage ? (
              <div className="client-app-overview-message-preview">
                <p className="client-app-overview-message-from">
                  {latestMessage.sender === 'client' ? 'You' : latestMessage.staff?.full_name || 'Europets Clinic'}
                </p>
                <p className="client-app-overview-message-body">{latestMessage.body}</p>
              </div>
            ) : (
              <p className="mobile-subtitle">No messages yet — say hello!</p>
            )}
            <a href="/client-app/messages" className="client-app-overview-open-messages">
              Open Messages
            </a>
          </div>
        </div>
      </div>

      <div className="client-app-logout-row">
        <button type="button" className="client-app-logout-btn" onClick={logout}>
          Log out
        </button>
      </div>
    </div>
  );
}
