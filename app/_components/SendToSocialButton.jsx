'use client';

// app/_components/SendToSocialButton.jsx
// "📸 Send to Social" under a photo a client sent in the chat
// (app/(admin)/messages/[id]), next to "File to a pet's record": pick the
// pet in it (or none) and the photo becomes a Social post draft the AI has
// already written (app/api/client-messages/[id]/to-social), opened straight
// away for staff to check and approve.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SendToSocialButton({ messageId, staffId }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pets, setPets] = useState(null);
  const [busy, setBusy] = useState(false);
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
      // Same pet list as "File to a pet's record".
      fetch(`/api/client-messages/${messageId}/attach`)
        .then((res) => res.json())
        .then((data) => (data.error ? setError(data.error) : setPets((data.pets || []).filter((p) => !p.deceased && !p.rehomed))));
    }
  }

  async function send(patientId) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/client-messages/${messageId}/to-social`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_id: patientId, staff_id: staffId || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      return setError(data.error || 'Could not send it to Social.');
    }
    router.push(`/social/${data.id}`);
  }

  return (
    <span className="file-to-record" ref={ref}>
      <button type="button" className="file-to-record-btn" onClick={toggle} disabled={busy} title="Make this photo a Social post: the AI writes it, you approve it">
        {busy ? '✨ Writing…' : '📸 Social'}
      </button>
      {open && !busy && (
        <div className="file-to-record-menu" role="menu">
          {error && <p className="error">{error}</p>}
          {!error && pets === null && <p className="visit-meta">Loading…</p>}
          {pets && (
            <div className="file-to-record-pet">
              <strong>Who&apos;s in the photo?</strong>
              {pets.map((p) => (
                <button key={p.id} type="button" onClick={() => send(p.id)}>
                  🐾 {p.name}
                </button>
              ))}
              <button type="button" onClick={() => send(null)}>No pet, or not sure</button>
              <small className="visit-meta">The AI writes the post; you check it before anything goes out.</small>
            </div>
          )}
        </div>
      )}
      {!open && error && <span className="error"> {error}</span>}
    </span>
  );
}
