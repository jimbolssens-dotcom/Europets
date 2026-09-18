// app/client-app/page.js
// Client-app landing page: a phone-number entry screen if nobody's logged
// in on this device yet, otherwise a dashboard — greeting, an alert if any
// of the client's pets is currently admitted (linking straight to the
// existing public portal status page for it), and quick links to the rest
// of the app. See useClientAppSession for what "logged in" means here, and
// app/client-app/layout.js for why this isn't real authentication yet.

'use client';

import { useEffect, useState } from 'react';
import { useClientAppSession } from '@/app/_components/useClientAppSession';
import { useClientAppTheme } from '@/app/_components/ClientAppThemeContext';
import HexIcon from '@/app/_components/HexIcon';
import HexfieldCanvas from '@/app/_components/HexfieldCanvas';
import EcgLine from '@/app/_components/EcgLine';
import { dueStatus, formatDate } from '@/lib/vaccinationDueStatus';

// Every phone number in the system is stored as +971<local number>, with
// no leading 0 on the local part (see migrations/071_normalize_phone_
// country_code.sql) — so a plain substring match against the stored text
// only works once the digits sent here are in that exact shape. Handles
// the same input variants that migration already normalizes for: a bare
// local number with its leading 0 ("0501234567"), one without ("501234567"),
// a country code typed with an international dialing prefix ("00971..."),
// or an accidental extra 0 right after typing the +971 prefix.
function normalizePhoneDigits(input) {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('00971')) digits = digits.slice(2);
  if (digits.startsWith('971')) {
    const rest = digits.slice(3).replace(/^0/, '');
    return `971${rest}`;
  }
  return `971${digits.replace(/^0/, '')}`;
}

const APPOINTMENT_TYPE_LABEL = {
  consult: 'Consult',
  video: 'Video consult',
  surgery: 'Surgery',
};

function formatApptWhen(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ClientAppHomePage() {
  const { clientId, ready, login, logout } = useClientAppSession();
  const theme = useClientAppTheme();
  const [phoneInput, setPhoneInput] = useState('+971 ');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [matches, setMatches] = useState(null);

  const [client, setClient] = useState(null);
  const [openAdmissions, setOpenAdmissions] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [consentRequests, setConsentRequests] = useState([]);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

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
    ])
      .then(async ([clientData, admissions, pets, appointments, pendingConsentForms]) => {
        if (cancelled) return;
        if (!clientData) {
          // Stale/deleted id on this phone — send them back to the login screen.
          logout();
          return;
        }
        setClient(clientData);
        setOpenAdmissions(Array.isArray(admissions) ? admissions : []);
        setConsentRequests(Array.isArray(pendingConsentForms) ? pendingConsentForms : []);

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

        const now = Date.now();
        const weekOut = now + 7 * 24 * 60 * 60 * 1000;
        const upcomingAppt = (Array.isArray(appointments) ? appointments : [])
          .filter(
            (a) =>
              a.status !== 'cancelled' &&
              new Date(a.start_time).getTime() >= now &&
              new Date(a.start_time).getTime() <= weekOut
          )
          .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];

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

  async function handlePhoneSubmit(e) {
    e.preventDefault();
    const digits = normalizePhoneDigits(phoneInput);
    if (digits.length < 12) {
      setError('Enter a valid phone number.');
      return;
    }
    setSubmitting(true);
    setError('');
    setMatches(null);
    try {
      const res = await fetch(`/api/clients?phone=${digits}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      if (data.length === 0) {
        setError("We couldn't find that number on file — please contact the clinic.");
      } else if (data.length === 1) {
        login(data[0].id);
      } else {
        setMatches(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) return null;

  if (!clientId) {
    const loginForm = !matches && (
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
          {submitting ? 'Looking up...' : 'Continue'}
        </button>
      </form>
    );

    return (
      <div className="mobile-page client-app-login">
        {theme === 'light' ? (
          <>
            <div className="mobile-heading-row">
              <a href="/" className="mobile-home-logo-link">
                <img src="/logo.png" alt="Europets Clinic" className="mobile-home-logo" />
              </a>
            </div>
            <p className="mobile-subtitle client-app-login-intro">
              Enter the phone number on file with the clinic to see your pets, invoices, and appointments.
            </p>
            {loginForm}
          </>
        ) : (
          <>
            <div className="client-app-hero">
              <HexfieldCanvas />
              <div className="client-app-hero-content">
                <div className="mobile-heading-row">
                  <a href="/" className="mobile-home-logo-link">
                    <img src="/logo.png" alt="Europets Clinic" className="mobile-home-logo" />
                  </a>
                </div>
                <p className="client-app-login-eyebrow">Client Portal</p>
                <p className="mobile-subtitle client-app-login-intro">
                  Enter the phone number on file with the clinic to see your pets, invoices, and appointments.
                </p>
                {loginForm}
              </div>
            </div>
            <EcgLine />
          </>
        )}
        {matches && (
          <>
            <p className="mobile-subtitle">A few accounts share that number — which one is you?</p>
            <ul className="mobile-list">
              {matches.map((m) => (
                <li key={m.id}>
                  <button type="button" className="mobile-list-item" onClick={() => login(m.id)}>
                    <span className="mobile-list-title">{m.full_name}</span>
                    <span className="mobile-list-meta">Client #{m.client_number}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="mobile-link-btn" onClick={() => setMatches(null)}>
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
        <a href="/" className="mobile-home-logo-link">
          <img src="/logo.png" alt="Europets Clinic" className="mobile-home-logo" />
        </a>
        <span className="mobile-greeting">Hello, {client?.full_name?.split(' ')[0] || 'there'}!</span>
      </div>
      <button type="button" className="mobile-link-btn" onClick={logout}>
        Not you? Switch account
      </button>

      {theme === 'dark' && <EcgLine />}

      {!loadingDashboard && openAdmissions.length > 0 && (
        <div className="client-app-admission-alert">
          {openAdmissions.map((h) => (
            <a key={h.id} href={`/portal/hospitalization/${h.id}`} className="client-app-admission-alert-link">
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
      </div>

      <p className="mobile-hint">
        Add this to your home screen for one-tap access: on iPhone, tap Share, then &quot;Add to Home
        Screen&quot;. On Android, tap the ⋮ menu, then &quot;Add to Home screen&quot; or &quot;Install
        app&quot;.
      </p>
    </div>
  );
}
