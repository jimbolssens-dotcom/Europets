// app/_components/PassedAwayAlarm.jsx
// The biggest alarm in the app (Jim, 22 Nov; migration 261): a patient
// passed away in hospital and its owner hasn't been told yet. A black band
// across the top of every staff screen, desktop and phone, that nobody can
// close: it goes only when someone records that they told the owner (who,
// and how). The owner's portal and app show nothing of it.

'use client';

import { useEffect, useId, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { startPacedRefresh } from '@/lib/pacedRefresh';
import { ownerNotTold, INFORMED_HOW } from '@/lib/passedAway';
import { formatDateTime } from '@/lib/formatTimestamp';

function OwnerInformedForm({ stay, staff, onDone }) {
  const [staffId, setStaffId] = useState('');
  const [how, setHow] = useState('phone');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  async function save() {
    setError(null);
    if (!staffId) return setError('Who told the owner?');
    setSaving(true);
    const res = await fetch(`/api/hospitalizations/${stay.id}/owner-informed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: staffId, how }),
    });
    const out = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(out.error || 'Could not save');
    onDone();
  }
  return (
    <div className="passed-away-form">
      <select value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-label="Who told the owner">
        <option value="">Who told the owner?</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>{s.full_name}</option>
        ))}
      </select>
      <div className="passed-away-how" role="group" aria-label="How">
        {INFORMED_HOW.map((h) => (
          <button key={h.value} type="button" className={how === h.value ? 'on' : ''} onClick={() => setHow(h.value)}>{h.label}</button>
        ))}
      </div>
      <button type="button" className="passed-away-confirm" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Confirm: the owner knows'}
      </button>
      {error && <span className="passed-away-error">{error}</span>}
    </div>
  );
}

export default function PassedAwayAlarm() {
  const [stays, setStays] = useState([]);
  const [staff, setStaff] = useState([]);
  const [openId, setOpenId] = useState(null);
  const id = useId();

  useEffect(() => {
    let active = true;
    const load = () =>
      fetch('/api/hospitalizations?status=admitted')
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => active && setStays((Array.isArray(d) ? d : []).filter(ownerNotTold)))
        .catch(() => {});
    const paced = startPacedRefresh(load);
    const channel = supabase
      .channel(`passed-away-alarm-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitalizations' }, paced.trigger)
      .subscribe();
    return () => {
      active = false;
      paced.stop();
      supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    if (!stays.length || staff.length) return;
    fetch('/api/staff?active=true').then((r) => r.json()).then((d) => setStaff(Array.isArray(d) ? d : [])).catch(() => {});
  }, [stays.length, staff.length]);

  async function undo(stay) {
    if (!confirm(`Undo "passed away" for ${stay.patients?.name}? Only if it was marked by mistake.`)) return;
    await fetch(`/api/hospitalizations/${stay.id}/passed-away`, { method: 'DELETE' });
    setStays((prev) => prev.filter((s) => s.id !== stay.id));
  }

  if (!stays.length) return null;
  return (
    <div className="passed-away-alarm" role="alert" aria-live="assertive">
      {stays.map((s) => {
        const pet = s.patients || {};
        const owner = s.clients || {};
        const phone = (owner.phone || '').replace(/[^\d+]/g, '');
        return (
          <div key={s.id} className="passed-away-row">
            <div className="passed-away-text">
              <span className="passed-away-icon" aria-hidden="true">🕯️</span>
              <div>
                <strong>
                  {pet.name}
                  {pet.patient_number ? ` #${pet.patient_number}` : ''} passed away {formatDateTime(s.passed_away_at)}.
                </strong>{' '}
                The owner{owner.full_name ? `, ${owner.full_name},` : ''} has <u>not</u> been told yet. Call them now.
              </div>
            </div>
            <div className="passed-away-actions">
              {phone && <a className="passed-away-call" href={`tel:${phone}`}>📞 {owner.phone}</a>}
              <a className="passed-away-open" href={`/hospitalization/${s.id}`}>Open</a>
              {openId === s.id ? (
                <OwnerInformedForm stay={s} staff={staff} onDone={() => { setOpenId(null); setStays((prev) => prev.filter((x) => x.id !== s.id)); }} />
              ) : (
                <button type="button" className="passed-away-done" onClick={() => setOpenId(s.id)}>✓ Owner has been contacted</button>
              )}
              <button type="button" className="passed-away-undo" onClick={() => undo(s)}>marked by mistake?</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
