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
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ClientAppAppointmentsPage() {
  const { clientId, ready } = useClientAppSession();
  const router = useRouter();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

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
