// app/client-app/appointments/page.js
// The logged-in client's own appointments — upcoming first, then past,
// each showing what pet, what type of visit, and with which vet.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClientAppSession } from '@/app/_components/useClientAppSession';

const TYPE_LABEL = {
  consult: 'Consult',
  video: 'Video consult',
  surgery: 'Surgery',
};

function formatWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function ClientAppAppointmentsPage() {
  const { clientId, ready } = useClientAppSession();
  const router = useRouter();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState(null);

  useEffect(() => {
    if (ready && !clientId) router.replace('/client-app');
  }, [ready, clientId, router]);

  useEffect(() => {
    if (!ready || !clientId) return;
    let cancelled = false;
    fetch(`/api/appointments?client_id=${clientId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) {
          setAppointments(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ready, clientId]);

  // Same "start a fresh intake request, open its portal link" flow as a
  // pet's own "Book an Appointment" button (app/client-app/pets/[id]) —
  // just without a ?pet= param, since the pet is picked on that form
  // instead when there's more than one to choose from. Navigates the
  // current tab rather than pre-opening a blank one to fill in later —
  // that pattern is unreliable on mobile browsers (popup blockers can
  // silently drop it, or focus can shift to the blank tab before an
  // error has a chance to render anywhere visible).
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
      window.location.href = `/portal/intake/${data.id}`;
    } catch (err) {
      setBookingError(err.message);
      setBookingLoading(false);
    }
  }

  if (!ready) return null;

  const now = Date.now();
  const upcoming = appointments
    .filter((a) => a.status !== 'cancelled' && new Date(a.start_time).getTime() >= now)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  const past = appointments
    .filter((a) => a.status === 'cancelled' || new Date(a.start_time).getTime() < now)
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

  function AppointmentRow({ appt }) {
    return (
      <li key={appt.id}>
        <div className="mobile-list-item">
          <span className="mobile-list-title">
            {TYPE_LABEL[appt.type] || appt.type} — {appt.patients?.name || 'Pet'}
          </span>
          <span className="mobile-list-meta">
            {formatWhen(appt.start_time)}
            {appt.staff?.full_name ? ` · ${appt.staff.full_name}` : ''}
            {appt.status === 'cancelled' ? ' · Cancelled' : ''}
          </span>
        </div>
      </li>
    );
  }

  return (
    <div className="mobile-page">
      <h1>Appointments</h1>
      <button type="button" onClick={startBooking} disabled={bookingLoading}>
        {bookingLoading ? 'Opening booking form...' : '📅 Book a New Appointment'}
      </button>
      {bookingError && <p className="client-app-login-error">{bookingError}</p>}
      {loading ? (
        <p className="mobile-subtitle">Loading...</p>
      ) : appointments.length === 0 ? (
        <p className="mobile-subtitle">No appointments yet.</p>
      ) : (
        <>
          <p className="mobile-section-header">Upcoming</p>
          {upcoming.length === 0 ? (
            <p className="mobile-subtitle">Nothing booked yet.</p>
          ) : (
            <ul className="mobile-list">
              {upcoming.map((appt) => (
                <AppointmentRow key={appt.id} appt={appt} />
              ))}
            </ul>
          )}
          {past.length > 0 && (
            <>
              <p className="mobile-section-header">Past</p>
              <ul className="mobile-list">
                {past.map((appt) => (
                  <AppointmentRow key={appt.id} appt={appt} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
