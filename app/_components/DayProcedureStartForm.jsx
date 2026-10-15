'use client';

// app/_components/DayProcedureStartForm.jsx
// The consult's "📋 Day Procedure" menu. Today: starts it now, as before.
// Tomorrow (or a later date): the patient stays in a cage overnight and the
// procedure is booked for that day (migration 193). One "Overnight" charge
// per night goes on its worksheet, then the calendar opens on that date
// with a surgery booking filled in, so it gets a vet and a time slot.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CagePicker from './CagePicker';
import { addDaysISO, dubaiDateISO } from '@/lib/dayProcedureSchedule';

export default function DayProcedureStartForm({ consult, reason, onReasonChange, onStartToday, admitting }) {
  const router = useRouter();
  const [ahead, setAhead] = useState(false);
  const [date, setDate] = useState(() => addDaysISO(dubaiDateISO(), 1));
  const [cageId, setCageId] = useState('');
  const [cages, setCages] = useState(null);
  const [occupied, setOccupied] = useState(new Set());
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ahead || cages) return;
    Promise.all([
      fetch('/api/cages').then((r) => r.json()),
      fetch('/api/hospitalizations?status=admitted').then((r) => r.json()),
    ])
      .then(([cageList, admitted]) => {
        setCages(Array.isArray(cageList) ? cageList : []);
        setOccupied(new Set((Array.isArray(admitted) ? admitted : []).filter((h) => h.status === 'admitted' && h.cage_id).map((h) => h.cage_id)));
      })
      .catch(() => setError('Could not load the cages'));
  }, [ahead, cages]);

  async function bookAhead(e) {
    e.preventDefault();
    if (booking) return;
    if (!cageId) return setError('Pick the cage for tonight');
    setBooking(true);
    setError(null);
    try {
      const res = await fetch('/api/hospitalizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originating_visit_id: consult.id, reason, kind: 'day_procedure', scheduled_for: date, cage_id: cageId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not book it');
      const params = new URLSearchParams({
        client_id: consult.client_id,
        patient_id: consult.patient_id,
        type: 'surgery',
        date,
        reason: reason || '',
        day_procedure_id: data.id,
      });
      router.push(`/appointments?${params}`);
    } catch (err) {
      setError(err.message);
      setBooking(false);
    }
  }

  const today = dubaiDateISO();
  return (
    <form className="consult-action-dropdown day-procedure-start" onSubmit={ahead ? bookAhead : onStartToday}>
      <div className="day-procedure-start-row">
        <input placeholder="Reason" value={reason} onChange={(e) => onReasonChange(e.target.value)} />
        <span className="day-procedure-when" role="group" aria-label="When">
          <button type="button" className={ahead ? '' : 'on'} onClick={() => setAhead(false)}>Today</button>
          <button type="button" className={ahead ? 'on' : ''} onClick={() => setAhead(true)}>Tomorrow</button>
        </span>
      </div>
      {ahead && (
        <>
          <label className="day-procedure-start-date">
            Procedure on
            <input type="date" value={date} min={addDaysISO(today, 1)} onChange={(e) => setDate(e.target.value)} required />
            <small>Overnight in the cage below</small>
          </label>
          {cages === null ? (
            <p className="visit-meta">Loading cages…</p>
          ) : (
            <CagePicker cages={cages} occupiedCageIds={occupied} value={cageId} onChange={setCageId} />
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={ahead ? booking || !cageId : admitting}>
        {ahead ? (booking ? 'Booking…' : 'Book & pick the time →') : admitting ? 'Starting...' : 'Start Day Procedure'}
      </button>
    </form>
  );
}
