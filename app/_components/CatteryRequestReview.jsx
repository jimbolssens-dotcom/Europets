'use client';

// app/_components/CatteryRequestReview.jsx
// Staff review of a client's cattery request (status 'requested', see
// migration 170): who's asking, the space and dates they picked, their
// notes, and the cat's vaccinations (overdue ones flagged, not blocking).
// Staff can change the space/dates, then Approve (confirms the booking and
// sends the cattery consent form, see PATCH /api/cattery/[id]) or Decline
// with a short reason the client sees.

import { useEffect, useState } from 'react';
import { CATTERY_SPACES } from '@/lib/cattery';
import { dueStatus, formatDate } from '@/lib/vaccinationDueStatus';

function hoursLeft(iso) {
  if (!iso) return null;
  const h = Math.round((new Date(iso).getTime() - Date.now()) / 3600000);
  return h > 0 ? `${h} h` : 'less than an hour';
}

export default function CatteryRequestReview({ booking, onClose, onDone }) {
  const [draft, setDraft] = useState({ space_number: booking.space_number, date_in: booking.date_in, date_out: booking.date_out });
  const [vaccinations, setVaccinations] = useState(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/vaccinations?patient_id=${booking.patient_id}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        // Latest record per vaccine name.
        const latest = {};
        for (const v of Array.isArray(rows) ? rows : []) {
          const key = (v.vaccine_name || '').toLowerCase();
          if (!latest[key] || (v.date_given || '') > (latest[key].date_given || '')) latest[key] = v;
        }
        setVaccinations(Object.values(latest));
      });
  }, [booking.patient_id]);

  async function send(body) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/cattery/${booking.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Could not save.');
    onDone(data);
  }

  const c = booking.clients || {};
  const overdue = (vaccinations || []).filter((v) => v.next_due_date && dueStatus(v.next_due_date)?.className === 'error');

  return (
    <div className="cattery-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cattery-modal" role="dialog" aria-label="Cattery booking request">
        <h3>Booking request: {booking.patients?.name}</h3>
        <p className="visit-meta">
          Sent from the client app{booking.request_expires_at ? ` · expires in ${hoursLeft(booking.request_expires_at)} if not answered` : ''}
        </p>
        <dl className="cattery-kv">
          <dt>Owner</dt>
          <dd>
            <a href={`/clients/${c.id}`}>{c.full_name}</a>
            {c.client_number ? ` #${c.client_number}` : ''}
            {c.phone ? ` · ${c.phone}` : ''}
          </dd>
          <dt>Asked for</dt>
          <dd>Space {booking.space_number}, {booking.date_in} to {booking.date_out}</dd>
          <dt>Vaccinations</dt>
          <dd>
            {vaccinations === null ? (
              'Checking…'
            ) : vaccinations.length === 0 ? (
              <span className="warn">⚠️ No vaccinations on file</span>
            ) : overdue.length ? (
              <span className="warn">⚠️ Overdue: {overdue.map((v) => `${v.vaccine_name} (due ${formatDate(v.next_due_date)})`).join(', ')}</span>
            ) : (
              <span className="ok">✅ Up to date</span>
            )}
          </dd>
          <dt>Owner notes</dt>
          <dd>{booking.owner_notes || <span className="visit-meta">None</span>}</dd>
        </dl>

        {!declining ? (
          <>
            <div className="cattery-form-row">
              <label>
                Space
                <select value={draft.space_number} onChange={(e) => setDraft({ ...draft, space_number: Number(e.target.value) })}>
                  {CATTERY_SPACES.map((s) => <option key={s} value={s}>Space {s}</option>)}
                </select>
              </label>
              <label>Date in<input type="date" value={draft.date_in} onChange={(e) => setDraft({ ...draft, date_in: e.target.value })} /></label>
              <label>Date out<input type="date" value={draft.date_out} onChange={(e) => setDraft({ ...draft, date_out: e.target.value })} /></label>
            </div>
            <div className="cattery-modal-actions">
              <button type="button" disabled={busy} onClick={() => send({ action: 'approve', ...draft })}>
                {busy ? 'Saving…' : '✅ Approve and send consent form'}
              </button>
              <button type="button" className="secondary cattery-decline" onClick={() => setDeclining(true)}>Decline</button>
              <button type="button" className="secondary" onClick={onClose}>Close</button>
            </div>
            <p className="visit-meta">Change the space or dates above before approving if needed. The client is told either way.</p>
          </>
        ) : (
          <>
            <label className="cattery-modal-reason">
              Reason (the client sees this)
              <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Fully booked those dates, but space 2 is free from the 22nd." />
            </label>
            <div className="cattery-modal-actions">
              <button type="button" className="cattery-decline-confirm" disabled={busy || !reason.trim()} onClick={() => send({ action: 'decline', decline_reason: reason })}>
                {busy ? 'Saving…' : 'Decline request'}
              </button>
              <button type="button" className="secondary" onClick={() => setDeclining(false)}>Back</button>
            </div>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
