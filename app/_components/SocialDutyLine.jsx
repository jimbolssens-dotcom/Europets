'use client';

// app/_components/SocialDutyLine.jsx
// Today's Social post duty (lib/socialDuty.js) on the Social page: who it
// is, done or not, and "Pass it on" when they can't (off sick, in theatre
// all day), which hands the turn to the next person and pushes it to them.

import { useEffect, useState } from 'react';

export default function SocialDutyLine() {
  const [duty, setDuty] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/social-duty')
      .then((res) => res.json())
      .then((d) => setDuty(d.duty || null))
      .catch(() => setDuty(null));
  }, []);

  async function act(action) {
    if (action === 'pass' && !confirm(`Pass today's post from ${duty.staff_name} to the next person?`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/social-duty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(d.error || 'Could not do that.');
    setDuty(d.duty || null);
  }

  if (duty === undefined) return null;
  return (
    <div className="social-duty-line">
      <span>📸 Today:</span>
      {duty ? (
        <>
          <strong>{duty.staff_name}</strong>
          {duty.done_at ? (
            duty.post_id ? (
              <a href={`/social/${duty.post_id}`} className="social-chip social-consent-yes">✓ Done</a>
            ) : (
              <span className="social-chip social-consent-yes">✓ Done</span>
            )
          ) : (
            <>
              <span className="social-chip social-consent-not_asked">Not yet</span>
              <button type="button" className="social-link-button" onClick={() => act('pass')} disabled={busy}>
                Pass it on
              </button>
            </>
          )}
        </>
      ) : (
        <button type="button" className="social-link-button" onClick={() => act('assign')} disabled={busy}>
          {busy ? 'Picking…' : "Pick today's person"}
        </button>
      )}
      {error && <span className="error">{error}</span>}
    </div>
  );
}
