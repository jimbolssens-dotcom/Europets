// app/_components/DewormingChip.jsx
// The small "🪱 Deworming" chip (Jim, 8 Nov), on the consult's patient
// header and the patient file: off, or a reminder every 3 or 6 months with
// the next due date. Tapping it opens a little panel to switch it and set
// the last deworming. The reminder itself goes out automatically 3 days
// before the due date (lib/dewormingReminders.js).

'use client';

import { useEffect, useRef, useState } from 'react';

function short(iso) {
  return iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
}
function long(iso) {
  return iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
}

export default function DewormingChip({ patientId }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!patientId) return;
    fetch(`/api/patients/${patientId}/deworming`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && !d.error && setData(d))
      .catch(() => {});
  }, [patientId]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const shut = () => setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', shut, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', shut, true);
    };
  }, [open]);

  async function save(change) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/patients/${patientId}/deworming`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(change),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Could not save');
      setData(out);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!patientId || !data) return null;
  const on = Boolean(data.intervalMonths);

  return (
    <span className="deworm-wrap" ref={ref}>
      <button
        type="button"
        className={`patient-chip deworm-chip${on ? ' on' : ''}`}
        onClick={(e) => {
          // A floating panel, so a card with overflow hidden can't clip it.
          const r = e.currentTarget.getBoundingClientRect();
          const width = Math.min(270, window.innerWidth - 32);
          setPos({ top: r.bottom + 6, left: Math.max(16, Math.min(r.left, window.innerWidth - width - 16)), width });
          setOpen((v) => !v);
        }}
        title={on ? `Deworming reminder every ${data.intervalMonths} months` : 'No deworming reminder'}
      >
        🪱 {on ? <>{data.intervalMonths} mo · {short(data.nextDue)}</> : 'Deworm'}
      </button>
      {open && (
        <div className="deworm-panel" role="dialog" aria-label="Deworming reminder" style={pos || undefined}>
          <div className="deworm-title">Deworming reminder</div>
          <div className="deworm-seg" role="group">
            {[null, 3, 6].map((v) => (
              <button
                key={String(v)}
                type="button"
                className={(data.intervalMonths || null) === v ? 'on' : ''}
                disabled={saving}
                onClick={() => save({ interval_months: v })}
              >
                {v ? `${v} months` : 'Off'}
              </button>
            ))}
          </div>
          <label className="deworm-last">
            Last dewormed{' '}
            <input
              type="date"
              value={data.lastDate || ''}
              disabled={saving}
              onChange={(e) => e.target.value && save({ last_date: e.target.value })}
            />
          </label>
          {data.lastDateSource === 'invoice' && <div className="deworm-note">From the last dewormer charged.</div>}
          {on && (
            <div className="deworm-note">
              Next due <b>{long(data.nextDue)}</b>. WhatsApp reminder 3 days before.
            </div>
          )}
          {error && <div className="error">{error}</div>}
        </div>
      )}
    </span>
  );
}
