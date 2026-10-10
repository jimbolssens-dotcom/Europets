'use client';

// app/_components/FileToRecordButton.jsx
// "📎 File to a pet's record" under a photo/file a client sent in the chat
// (app/(admin)/messages/[id]). Opens a small menu of that client's pets,
// each with any open hospital stay or day procedure and their 5 latest
// consults; picking one copies the file onto that record (see
// /api/client-messages/[id]/attach) and says where it went.

import { useEffect, useRef, useState } from 'react';

function shortDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' });
}

export default function FileToRecordButton({ messageId, staffId }) {
  const [open, setOpen] = useState(false);
  const [pets, setPets] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function toggle() {
    setError(null);
    setOpen((o) => !o);
    if (pets === null) {
      fetch(`/api/client-messages/${messageId}/attach`)
        .then((res) => res.json())
        .then((data) => (data.error ? setError(data.error) : setPets(data.pets || [])));
    }
  }

  async function fileTo(entityType, entityId, label) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/client-messages/${messageId}/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId, uploaded_by: staffId || null }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Could not file it.');
    setDone({ label, href: entityType === 'visit' ? `/consults/${entityId}` : `/hospitalization/${entityId}` });
    setOpen(false);
  }

  return (
    <span className="file-to-record" ref={ref}>
      {done ? (
        <span className="file-to-record-done">
          ✓ Filed to <a href={done.href}>{done.label}</a>{' '}
          <button type="button" className="file-to-record-again" onClick={toggle}>File again</button>
        </span>
      ) : (
        <button type="button" className="file-to-record-btn" onClick={toggle}>📎 File to a pet&apos;s record</button>
      )}
      {open && (
        <div className="file-to-record-menu" role="menu">
          {error && <p className="error">{error}</p>}
          {!error && pets === null && <p className="visit-meta">Loading…</p>}
          {pets?.length === 0 && <p className="visit-meta">This client has no pets on file.</p>}
          {pets?.map((p) => (
            <div key={p.id} className="file-to-record-pet">
              <strong>🐾 {p.name}</strong>
              {p.stays.length === 0 && p.visits.length === 0 && <span className="visit-meta">No consults yet</span>}
              {p.stays.map((s) => {
                const label = `${p.name}'s ${s.kind === 'day_procedure' ? 'day procedure' : 'hospital stay'} (${shortDate(s.admitted_at)})`;
                return (
                  <button key={s.id} type="button" disabled={busy} onClick={() => fileTo('hospitalization', s.id, label)}>
                    🏥 {s.kind === 'day_procedure' ? 'Day procedure' : 'Hospital stay'} since {shortDate(s.admitted_at)}
                    {s.reason ? <small> · {s.reason}</small> : null}
                  </button>
                );
              })}
              {p.visits.map((v) => {
                const label = `${p.name}'s consult (${shortDate(v.started_at)})`;
                return (
                  <button key={v.id} type="button" disabled={busy} onClick={() => fileTo('visit', v.id, label)}>
                    🩺 Consult {shortDate(v.started_at)}
                    {v.status === 'in_progress' ? <small> · open</small> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
