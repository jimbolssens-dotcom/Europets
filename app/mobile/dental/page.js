// app/mobile/dental/page.js
// Pick today's patient, then jump straight into recording a dental
// report for them — same "check in if needed, then open" flow as
// app/mobile/consults/page.js, but not filtered to consult-type
// appointments (dental work can come up on any visit, including a
// surgery-type appointment) and it creates a dental_reports row instead
// of just opening the visit, mirroring the desktop consult page's
// "Dictate New Dental Report" button.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MobileHomeButton from '@/app/_components/MobileHomeButton';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default function MobileDentalPickerPage() {
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

      setAppointments(appts.map((a) => ({ ...a, visit: visitByAppointment[a.id] || null })));
      setWalkIns(visits.filter((v) => !v.appointment_id));
      setLoading(false);
    });
  }, []);

  async function startDentalReport(visit) {
    const res = await fetch('/api/dental-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: visit.id }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/mobile/dental/${data.id}`);
  }

  async function openPatient(appointment) {
    if (appointment.visit) {
      startDentalReport(appointment.visit);
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
    if (res.ok) startDentalReport(data);
  }

  return (
    <div className="mobile-page">
      <MobileHomeButton />
      <h1>🦷 Dental Report</h1>
      <p className="mobile-hint">Pick a patient to start a dental chart and dictate a report.</p>

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
                    <button type="button" className="mobile-list-item" onClick={() => startDentalReport(v)}>
                      <span className="mobile-list-title">{v.patients?.name}</span>
                      <span className="mobile-list-meta">{v.clients?.full_name}</span>
                    </button>
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
                    onClick={() => !done && openPatient(a)}
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
