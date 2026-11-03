// app/_components/KindnessHome.jsx
// The staff homepage: the top menu already links everywhere, so instead of
// a second set of links the homepage is a little kindness garden (Jim:
// "something cute ... that will encourage the staff to remember to be
// kind, to bring happiness, and to make somebody else smile").
//
// - A greeting that follows the time of day, with a sky to match.
// - Today's kindness mission (the same for everyone all day, lib/kindness.js).
// - "I made someone smile" plants a flower in the team's shared garden for
//   the week (app/api/smiles, migration 240), with a burst of hearts and an
//   optional one-line note of what happened.
// - On a computer: drifting paws and hearts, a rotating quote and the
//   latest smiles as notes. On a phone: just the greeting, the mission, the
//   button and the garden, so it stays one screen.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { FLOWERS, KINDNESS_QUOTES, greetingFor, missionFor } from '@/lib/kindness';
import { startPacedRefresh } from '@/lib/pacedRefresh';

const NAME_KEY = 'europets_smile_name';

function timeAgo(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function Burst({ id }) {
  // A handful of hearts and smiles flying up from the button.
  const bits = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        emoji: ['💖', '😊', '💛', '🐾', '✨', '🌸'][i % 6],
        x: Math.round((Math.random() - 0.5) * 260),
        rot: Math.round((Math.random() - 0.5) * 80),
        delay: Math.round(Math.random() * 180),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id]
  );
  return (
    <span className="kind-burst" aria-hidden="true">
      {bits.map((b, i) => (
        <span key={i} style={{ '--x': `${b.x}px`, '--rot': `${b.rot}deg`, animationDelay: `${b.delay}ms` }}>
          {b.emoji}
        </span>
      ))}
    </span>
  );
}

export default function KindnessHome() {
  const [now, setNow] = useState(() => new Date());
  const [garden, setGarden] = useState(null); // { week, today, recent }
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [planting, setPlanting] = useState(false);
  const [burst, setBurst] = useState(0);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [thanks, setThanks] = useState(null);

  const greeting = greetingFor(now);
  const mission = missionFor(now);

  const load = () =>
    fetch('/api/smiles', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => (d && !d.error ? setGarden(d) : setGarden({ week: 0, today: 0, recent: [] })))
      .catch(() => setGarden({ week: 0, today: 0, recent: [] }));

  useEffect(() => {
    load();
    try {
      setName(window.localStorage.getItem(NAME_KEY) || '');
    } catch {
      // storage blocked: just ask each time
    }
    setQuoteIndex(Math.floor(Math.random() * KINDNESS_QUOTES.length));
    const clock = setInterval(() => setNow(new Date()), 60000);
    const quotes = setInterval(() => setQuoteIndex((i) => (i + 1) % KINDNESS_QUOTES.length), 9000);
    // The garden: every 2 min open, 15 min closed, none while hidden.
    const refresh = startPacedRefresh(load, { initial: false });
    return () => {
      clearInterval(clock);
      clearInterval(quotes);
      refresh.stop();
    };
  }, []);

  async function plant(e) {
    e?.preventDefault();
    if (planting) return;
    setPlanting(true);
    setBurst((n) => n + 1);
    try {
      if (name) window.localStorage.setItem(NAME_KEY, name);
    } catch {
      // ignore
    }
    const res = await fetch('/api/smiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note, by: name }),
    }).catch(() => null);
    setPlanting(false);
    if (res?.ok) {
      const row = await res.json();
      setGarden((g) => ({
        week: (g?.week || 0) + 1,
        today: (g?.today || 0) + 1,
        recent: [row, ...(g?.recent || [])],
      }));
      setNote('');
      setThanks(['You made the world a little brighter!', 'Another flower in our garden!', 'That smile counts. Thank you!', 'Kindness planted. 🌱'][Math.floor(Math.random() * 4)]);
      setTimeout(() => setThanks(null), 3500);
    }
  }

  const flowers = (garden?.recent || []).slice().reverse();
  const notes = (garden?.recent || []).filter((r) => r.note).slice(0, 4);

  return (
    <div className={`kind-home kind-sky-${greeting.sky}`}>
      {/* Drifting paws and hearts (computer only, behind everything). */}
      <div className="kind-float" aria-hidden="true">
        {['🐾', '💗', '🐾', '💛', '🐾', '💜', '🐾', '💚'].map((e, i) => (
          <span key={i} style={{ left: `${6 + i * 12}%`, animationDelay: `${i * 1.7}s`, animationDuration: `${14 + (i % 3) * 4}s` }}>
            {e}
          </span>
        ))}
      </div>

      <section className="kind-hero">
        <div className="kind-mascots" aria-hidden="true">
          <span className="kind-mascot kind-mascot-dog">🐶</span>
          <span className="kind-mascot kind-mascot-cat">🐱</span>
        </div>
        <h1 className="kind-greeting">
          {greeting.text}, team <span className="kind-greeting-emoji">{greeting.emoji}</span>
        </h1>
        <p className="kind-sub">Every pet is someone&apos;s whole world. Let&apos;s make today a kind one.</p>
      </section>

      <div className="kind-grid">
        <section className="kind-card kind-mission">
          <span className="kind-label">Today&apos;s kindness mission</span>
          <p className="kind-mission-text">
            <span className="kind-mission-emoji">{mission.emoji}</span> {mission.text}
          </p>
        </section>

        <section className="kind-card kind-smile">
          <form onSubmit={plant} className="kind-smile-form">
            <button type="submit" className="kind-smile-btn" disabled={planting}>
              <span className="kind-smile-face">😊</span> I made someone smile!
              {burst > 0 && <Burst key={burst} id={burst} />}
            </button>
            <div className="kind-smile-fields">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened? (optional)" maxLength={140} />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" maxLength={60} className="kind-name" />
            </div>
          </form>
          {thanks && <p className="kind-thanks">{thanks}</p>}
        </section>

        <section className="kind-card kind-garden">
          <div className="kind-garden-head">
            <span className="kind-label">Our kindness garden</span>
            <span className="kind-garden-count">
              {garden ? (
                <>
                  <b>{garden.week}</b> smile{garden.week === 1 ? '' : 's'} this week
                  {garden.today > 0 && <> · <b>{garden.today}</b> today</>}
                </>
              ) : (
                '…'
              )}
            </span>
          </div>
          <div className="kind-garden-bed">
            {garden && flowers.length === 0 && <span className="kind-garden-empty">🌱 The first flower of the week is waiting for you.</span>}
            {flowers.map((f) => (
              <span key={f.id} className="kind-flower" title={[f.note, f.by && `by ${f.by}`, timeAgo(f.created_at)].filter(Boolean).join(' · ')}>
                {FLOWERS[f.id % FLOWERS.length]}
              </span>
            ))}
          </div>
          <div className="kind-grass" aria-hidden="true" />
        </section>

        {notes.length > 0 && (
          <section className="kind-card kind-notes">
            <span className="kind-label">Smiles we made</span>
            <ul>
              {notes.map((n) => (
                <li key={n.id}>
                  <span className="kind-note-flower">{FLOWERS[n.id % FLOWERS.length]}</span> {n.note}
                  <span className="kind-note-meta">
                    {n.by ? ` · ${n.by}` : ''} · {timeAgo(n.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="kind-card kind-quote" aria-live="polite">
          <span key={quoteIndex} className="kind-quote-text">“{KINDNESS_QUOTES[quoteIndex]}”</span>
        </section>
      </div>
    </div>
  );
}
