// app/mobile/consults/page.js
// Today's appointments, one tap into a recording. Tapping an appointment
// that hasn't been checked in yet checks it in (creates the visit) first
// — same as clicking "Check In" on the desktop appointment calendar —
// then jumps straight to /mobile/consults/[visitId]. One already in
// progress goes straight there.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MobileHomeButton from '@/app/_components/MobileHomeButton';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default function MobileConsultsPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState([]);
  const [walkIns, setWalkIns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/appointments?date=${todayISODate()}`).then((res) => res.json()),
      fetch('/api/visits?status=in_progress').then((res) => res.json()),
    ]).then(([appointmentsData, visitsData]) => {
      const appts = Array.isArray(appointmentsData) ? appointmentsData : [];
      const visits = Array.isArray(visitsData) ? visitsData : [];
      const visitByAppointment = Object.fromEntries(
        visits.filter((v) => v.appointment_id).map((v) => [v.appointment_id, v])
      );

      setAppointments(
        appts
          .filter((a) => a.type !== 'surgery')
          .map((a) => ({ ...a, visit: visitByAppointment[a.id] || null }))
      );
      setWalkIns(visits.filter((v) => !v.appointment_id));
      setLoading(false);
    });
  }, []);

  async function openConsult(appointment) {
    if (appointment.visit) {
      router.push(`/mobile/consults/${appointment.visit.id}`);
      return;
    }
    setStartingId(appointment.id);
    const res = await fetch('/api/visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointment_id: appointment.id }),
    });
    const data = await res.json();
    setStartingId(null);
    if (res.ok) router.push(`/mobile/consults/${data.id}`);
  }

  return (
    <div className="mobile-page">
      <MobileHomeButton />
      <h1>Consults</h1>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          {walkIns.length > 0 && (
            <>
              <h2 className="mobile-section-header">In Progress</h2>
              <ul className="mobile-list">
                {walkIns.map((v) => (
                  <li key={v.id}>
                    <a href={`/mobile/consults/${v.id}`} className="mobile-list-item">
                      <span className="mobile-list-title">{v.patients?.name}</span>
                      <span className="mobile-list-meta">{v.clients?.full_name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2 className="mobile-section-header">Today's Appointments</h2>
          {appointments.length === 0 && <p>No appointments today.</p>}
          <ul className="mobile-list">
            {appointments.map((a) => {
              const done = a.status === 'complete' || a.status === 'cancelled';
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    className={`mobile-list-item${done ? ' mobile-list-item-disabled' : ''}`}
                    onClick={() => !done && openConsult(a)}
                    disabled={done || startingId === a.id}
                  >
                    <span className="mobile-list-title">{a.patients?.name || 'Unknown patient'}</span>
                    <span className="mobile-list-meta">
                      {new Date(a.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ·{' '}
                      {a.clients?.full_name} · {startingId === a.id ? 'Checking in...' : a.status}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
