// app/_components/PassedAwayButton.jsx
// "🕯️ Passed away" on an open hospital stay or day procedure (migration
// 261): records when, and who. From then on the black alarm
// (PassedAwayAlarm) is on every staff screen until someone records that the
// owner was told. Nothing is shown to the owner.

'use client';

import { useState } from 'react';

function dubaiLocalNow() {
  return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export default function PassedAwayButton({ hospitalizationId, patientName, staff = [], onMarked }) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState(dubaiLocalNow);
  const [staffId, setStaffId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setError(null);
    if (!staffId) return setError('Choose who is recording this.');
    setSaving(true);
    const res = await fetch(`/api/hospitalizations/${hospitalizationId}/passed-away`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The time typed is UAE time.
      body: JSON.stringify({ staff_id: staffId, passed_away_at: `${when}:00+04:00` }),
    });
    const out = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(out.error || 'Could not save');
    setOpen(false);
    onMarked?.(out);
  }

  if (!open) {
    return (
      <button type="button" className="button-link passed-away-mark" onClick={() => setOpen(true)} title={`Record that ${patientName || 'this patient'} passed away`}>
        🕯️ Passed away
      </button>
    );
  }
  return (
    <div className="passed-away-mark-form" role="dialog" aria-label="Record that the patient passed away">
      <strong>{patientName || 'This patient'} passed away</strong>
      <label>
        When{' '}
        <input type="datetime-local" value={when} max={dubaiLocalNow()} onChange={(e) => setWhen(e.target.value)} />
      </label>
      <select value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-label="Recorded by">
        <option value="">Recorded by…</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>{s.full_name}</option>
        ))}
      </select>
      <p className="visit-meta">The owner sees nothing of this. Every staff screen shows a black alarm until someone records that the owner was told.</p>
      <div className="home-links">
        <button type="button" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Confirm'}</button>
        <button type="button" className="secondary" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
