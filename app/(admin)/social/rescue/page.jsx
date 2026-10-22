// app/(admin)/social/rescue/page.jsx
// Daily rescue updates (migration 218, lib/rescueUpdates.js): for each
// rescue partner, their animals in hospital today as tiles. Tap one to take
// its photo with the phone's camera (retake by tapping again). "✨ Make
// today's post" has the AI write one carousel post from them, which opens
// for approval like any other Social post. The morning push links here.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadSocialFile } from '@/lib/socialUpload';

function staffId() {
  try {
    return localStorage.getItem('social_staff_id') || localStorage.getItem('europets_mobile_staff_id') || null;
  } catch {
    return null;
  }
}

function PartnerDay({ day, onChange }) {
  const router = useRouter();
  const [busy, setBusy] = useState(null); // patient id, or 'draft'
  const [error, setError] = useState(null);
  const [postId, setPostId] = useState(day.post?.id || null);
  const photos = day.cases.filter((c) => c.photo_url).length;

  async function ensurePost() {
    if (postId) return postId;
    const res = await fetch(`/api/rescue-updates/${day.client_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', staff_id: staffId() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not start the post.');
    setPostId(data.post_id);
    return data.post_id;
  }

  async function takePhoto(c, e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(c.patient_id);
    setError(null);
    try {
      const id = await ensurePost();
      const media = await uploadSocialFile(id, file);
      const res = await fetch(`/api/rescue-updates/${day.client_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'photo', post_id: id, patient_id: c.patient_id, media }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not add the photo.');
      onChange(data);
    } catch (err) {
      setError(err.message);
    }
    setBusy(null);
  }

  async function makePost() {
    setBusy('draft');
    setError(null);
    const res = await fetch(`/api/social-posts/${postId}/draft`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'The AI could not write this one. Open it and tap Redo.');
    }
    router.push(`/social/${postId}`);
  }

  return (
    <section className="card social-card rescue-day">
      <div className="rescue-day-head">
        <strong>@{day.instagram_handle}</strong>
        <span className={`social-chip ${photos === day.cases.length && photos > 0 ? 'social-consent-yes' : ''}`}>
          📸 {photos} of {day.cases.length}
        </span>
        {day.invite_collab && <span className="social-chip" title="Posted as a collaboration: it shows on their profile too once they accept" aria-label="Collab">🤝</span>}
      </div>
      {day.cases.length === 0 ? (
        <p className="visit-meta">None of their animals are in hospital today.</p>
      ) : (
        <div className="rescue-tiles">
          {day.cases.map((c) => (
            <label key={c.patient_id} className={`rescue-tile${c.photo_url ? ' rescue-tile-done' : ''}`}>
              {c.photo_url ? <img src={c.photo_url} alt="" /> : <span className="rescue-tile-cam">{busy === c.patient_id ? '...' : '📷'}</span>}
              <span className="rescue-tile-day">Day {c.day}</span>
              <span className="rescue-tile-name">{c.name}</span>
              {busy === c.patient_id && c.photo_url && <span className="rescue-tile-busy">...</span>}
              <input type="file" accept="image/*" capture="environment" onChange={(e) => takePhoto(c, e)} disabled={!!busy} aria-label={`Photo of ${c.name}`} />
            </label>
          ))}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {day.cases.length > 0 && (
        <div className="rescue-day-actions">
          {day.post?.drafted ? (
            <a className="button-link" href={`/social/${day.post.id}`}>
              Open today&apos;s post →
            </a>
          ) : (
            <button type="button" onClick={makePost} disabled={!postId || photos === 0 || !!busy}>
              {busy === 'draft' ? '✨ Writing...' : `✨ Make today's post${photos && photos < day.cases.length ? ` (${photos} of ${day.cases.length})` : ''}`}
            </button>
          )}
          <span className="visit-meta">One photo each. The AI writes it, you approve it.</span>
        </div>
      )}
    </section>
  );
}

export default function RescueUpdatesPage() {
  const [partners, setPartners] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/rescue-updates')
      .then((res) => res.json())
      .then((d) => setPartners(d.partners || []))
      .catch(() => setError('Could not load the rescue updates.'));
  }, []);

  return (
    <div className="social-page">
      <div className="page-header">
        <h1>Rescue updates</h1>
        <div className="page-header-actions">
          <a href="/social" className="button-link social-ghost">Social</a>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {!partners && !error && <p className="visit-meta">Loading...</p>}
      {partners?.length === 0 && <p className="visit-meta">No rescue partners set up yet.</p>}
      {partners?.map((p) => (
        <PartnerDay key={p.client_id} day={p} onChange={(next) => setPartners((all) => all.map((x) => (x.client_id === next.client_id ? next : x)))} />
      ))}
    </div>
  );
}
