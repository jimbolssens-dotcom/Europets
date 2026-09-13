// app/(admin)/day-procedures/page.jsx
// A dedicated home for day procedures (dropped off in the morning, picked
// up the same day) — they're hospitalizations under the hood (kind:
// 'day_procedure', see migration 088), but don't belong on the
// Hospitalization page's cage layout/admissions list, which is about
// overnight stays. Started from a patient file, a consult ("Start Day
// Procedure"), or a surgery-type appointment check-in — never from here;
// this page is purely a running list to find one again.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default function DayProceduresPage() {
  const [dayProcedures, setDayProcedures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = () =>
    fetch('/api/hospitalizations?kind=day_procedure')
      .then((res) => res.json())
      .then((data) => {
        setDayProcedures(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load day procedures');
        setLoading(false);
      });

  async function deleteDayProcedure(d) {
    const patientLabel = `${d.patients?.name}${d.patients?.patient_number ? ` (Patient #${d.patients.patient_number})` : ''}`;
    if (!confirm(`Delete this day procedure for ${patientLabel}? This cannot be undone.`)) return;
    setError(null);
    setDeletingId(d.id);
    try {
      const res = await fetch(`/api/hospitalizations/${d.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete day procedure');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel('day-procedures-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitalizations' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  if (loading) return <p>Loading day procedures...</p>;

  // Day procedures are a day-by-day thing — dropped off and picked up the
  // same day, never carried over as a running worklist. One left unfinished
  // overnight still exists (open its own hospitalization page from the
  // patient's file/history), it just no longer clutters today's list.
  const today = todayISODate();
  const todaysDayProcedures = dayProcedures.filter((d) => d.admitted_at?.slice(0, 10) === today);
  const inProgress = todaysDayProcedures.filter((d) => d.status === 'admitted');
  const completed = todaysDayProcedures.filter((d) => d.status === 'discharged');

  return (
    <div>
      <div className="page-header">
        <h1>📋 Day Procedures</h1>
      </div>
      <p className="visit-meta">
        Same-day cases — dropped off in the morning, picked up the same day. Start one from a patient&apos;s
        file, from a consult (&quot;Start Day Procedure&quot;), or automatically when a surgery-type
        appointment is checked in.
      </p>
      {error && <p className="error">{error}</p>}

      <h2>In Progress</h2>
      {inProgress.length === 0 ? (
        <p>No day procedures in progress.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Owner</th>
              <th>Reason</th>
              <th>Started</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {inProgress.map((d) => (
              <tr key={d.id}>
                <td>
                  {d.patients?.name}
                  {d.patients?.patient_number ? ` (Patient #${d.patients.patient_number})` : ''}
                </td>
                <td>
                  {d.clients?.full_name}
                  {d.clients?.client_number ? ` (Client #${d.clients.client_number})` : ''}
                </td>
                <td>{d.reason || '—'}</td>
                <td>{new Date(d.admitted_at).toLocaleString()}</td>
                <td>
                  <a href={`/hospitalization/${d.id}`}>Open</a>{' '}
                  <button type="button" onClick={() => deleteDayProcedure(d)} disabled={deletingId === d.id}>
                    {deletingId === d.id ? 'Deleting…' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Completed Today</h2>
      {completed.length === 0 ? (
        <p>No day procedures completed today yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Owner</th>
              <th>Completed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {completed.map((d) => (
              <tr key={d.id}>
                <td>
                  {d.patients?.name}
                  {d.patients?.patient_number ? ` (Patient #${d.patients.patient_number})` : ''}
                </td>
                <td>
                  {d.clients?.full_name}
                  {d.clients?.client_number ? ` (Client #${d.clients.client_number})` : ''}
                </td>
                <td>{d.discharged_at ? new Date(d.discharged_at).toLocaleString() : '—'}</td>
                <td>
                  <a href={`/hospitalization/${d.id}`}>Open</a>{' '}
                  <button type="button" onClick={() => deleteDayProcedure(d)} disabled={deletingId === d.id}>
                    {deletingId === d.id ? 'Deleting…' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
