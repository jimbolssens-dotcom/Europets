'use client';

// app/client-app/cattery/new/page.js
// A client asks for a cattery stay: pick one of their cats, the dates in
// and out, then one of the 7 spaces (only free ones can be picked, from
// GET /api/cattery/availability), add notes, and send. That creates a
// request (POST /api/cattery/requests) which holds the space for 48 hours
// while the clinic reviews it; nothing is confirmed until staff approve it.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClientAppSession } from '@/app/_components/useClientAppSession';
import { CATTERY_SPACES, catteryToday } from '@/lib/cattery';

function prettyDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
function nights(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 864e5);
}

export default function ClientAppCatteryBookPage() {
  const { clientId, ready } = useClientAppSession();
  const router = useRouter();
  const today = catteryToday();
  const [cats, setCats] = useState(null);
  const [catId, setCatId] = useState('');
  const [dateIn, setDateIn] = useState('');
  const [dateOut, setDateOut] = useState('');
  const [taken, setTaken] = useState(null);
  const [space, setSpace] = useState(null);
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(null);

  useEffect(() => {
    if (ready && !clientId) router.replace('/client-app');
  }, [ready, clientId, router]);

  useEffect(() => {
    if (!ready || !clientId) return;
    fetch(`/api/patients?client_id=${clientId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((pets) => {
        const list = (Array.isArray(pets) ? pets : []).filter((p) => !p.deceased && !p.rehomed && /cat|feline/i.test(p.species || ''));
        setCats(list);
        if (list.length === 1) setCatId(list[0].id);
      });
  }, [ready, clientId]);

  const datesValid = dateIn && dateOut && dateIn >= today && dateOut >= dateIn;

  useEffect(() => {
    setTaken(null);
    setSpace(null);
    if (!datesValid) return;
    fetch(`/api/cattery/availability?date_in=${dateIn}&date_out=${dateOut}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { taken: [] }))
      .then((data) => setTaken(data.taken || []));
  }, [dateIn, dateOut, datesValid]);

  async function send() {
    setSending(true);
    setError(null);
    const res = await fetch('/api/cattery/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_id: catId, date_in: dateIn, date_out: dateOut, space_number: space, owner_notes: notes }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(data.error || 'Something went wrong, please try again.');
      if (res.status === 409) setTaken((t) => [...(t || []), space]);
      return;
    }
    setSent({ ...data, catName: cats.find((c) => c.id === catId)?.name });
  }

  if (!ready || !clientId) return null;

  if (sent) {
    return (
      <div className="mobile-page client-app-cattery-page client-app-cattery-sent">
        <div className="client-app-cattery-sent-icon">⏳</div>
        <h1>Request sent</h1>
        <p>
          We&apos;ve received your request for <strong>{sent.catName}</strong>, <strong>space {sent.space_number}</strong>,{' '}
          <strong>{prettyDate(sent.date_in)} to {prettyDate(sent.date_out)}</strong>.
        </p>
        <p className="mobile-subtitle">
          Space {sent.space_number} is held for you while our team reviews it. We&apos;ll confirm within 48 hours and let you know.
        </p>
        <a href="/client-app/cattery" className="client-app-cattery-book">Back to Cattery</a>
      </div>
    );
  }

  const canSend = catId && datesValid && space && !sending;

  return (
    <div className="mobile-page client-app-cattery-page">
      <a href="/client-app/cattery" className="mobile-link-btn">← Cattery</a>
      <h1>Book a stay</h1>

      {cats === null ? (
        <p className="mobile-subtitle">Loading...</p>
      ) : cats.length === 0 ? (
        <p className="mobile-subtitle">We don&apos;t have a cat on file for you yet. Send us a message in Chat and we&apos;ll set it up.</p>
      ) : (
        <>
          <p className="client-app-cattery-label">Which cat?</p>
          <div className="client-app-cattery-cats">
            {cats.map((c) => (
              <button key={c.id} type="button" className={`client-app-cattery-choice ${catId === c.id ? 'on' : ''}`} onClick={() => setCatId(c.id)}>
                🐱 <strong>{c.name}</strong>
              </button>
            ))}
          </div>

          <div className="client-app-cattery-dates">
            <label>
              <span className="client-app-cattery-label">Date in</span>
              <input type="date" min={today} value={dateIn} onChange={(e) => { setDateIn(e.target.value); if (dateOut && dateOut < e.target.value) setDateOut(''); }} />
            </label>
            <label>
              <span className="client-app-cattery-label">Date out</span>
              <input type="date" min={dateIn || today} value={dateOut} onChange={(e) => setDateOut(e.target.value)} />
            </label>
          </div>

          {datesValid && (
            <>
              <p className="client-app-cattery-label">
                Choose a space (free for all {nights(dateIn, dateOut) || 1} night{nights(dateIn, dateOut) === 1 ? '' : 's'})
              </p>
              {taken === null ? (
                <p className="mobile-subtitle">Checking which spaces are free...</p>
              ) : taken.length >= CATTERY_SPACES.length ? (
                <p className="mobile-subtitle">Sorry, every space is taken on some of those dates. Try other dates, or message us in Chat.</p>
              ) : (
                <>
                  <div className="client-app-cattery-spaces">
                    {CATTERY_SPACES.map((s) => {
                      const isTaken = taken.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          disabled={isTaken}
                          className={`client-app-cattery-space ${isTaken ? 'taken' : ''} ${space === s ? 'on' : ''}`}
                          onClick={() => setSpace(s)}
                        >
                          <b>{s}</b>
                          {isTaken ? 'Taken' : 'Free'}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mobile-subtitle">Greyed out spaces are already taken on some of those dates.</p>
                </>
              )}
            </>
          )}

          <label className="client-app-cattery-notes">
            <span className="client-app-cattery-label">Anything we should know? (diet, medication, habits)</span>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          {error && <p className="client-app-login-error">{error}</p>}
          <button type="button" className="client-app-cattery-book" disabled={!canSend} onClick={send}>
            {sending ? 'Sending...' : 'Send booking request'}
          </button>
          <p className="mobile-subtitle">
            Your stay is confirmed once our team approves it. You&apos;ll get a notification, then the cattery consent form on WhatsApp.
          </p>
        </>
      )}
    </div>
  );
}
