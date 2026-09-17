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

export default function ClientAppHomePage() {
  const { clientId, ready, login, logout } = useClientAppSession();
  const theme = useClientAppTheme();
  const [phoneInput, setPhoneInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [matches, setMatches] = useState(null);

  const [client, setClient] = useState(null);
  const [openAdmissions, setOpenAdmissions] = useState([]);
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
    ])
      .then(([clientData, admissions]) => {
        if (cancelled) return;
        if (!clientData) {
          // Stale/deleted id on this phone — send them back to the login screen.
          logout();
          return;
        }
        setClient(clientData);
        setOpenAdmissions(Array.isArray(admissions) ? admissions : []);
      })
      .finally(() => !cancelled && setLoadingDashboard(false));
    return () => {
      cancelled = true;
    };
  }, [ready, clientId, logout]);

  async function handlePhoneSubmit(e) {
    e.preventDefault();
    const digits = phoneInput.replace(/\D/g, '');
    if (digits.length < 7) {
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
          placeholder="e.g. 050 123 4567"
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
