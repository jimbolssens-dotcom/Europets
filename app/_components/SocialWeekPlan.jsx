'use client';

// app/_components/SocialWeekPlan.jsx
// "This week" on the Social page: the AI's 3 or 4 post ideas for the week,
// each with what to film (lib/socialPlan.js, made on Monday morning or with
// "Plan this week"). "＋ Upload for this" opens the upload page with the
// idea's shot list; a done idea shows its post.

import { useEffect, useState } from 'react';

const FORMAT = { reel: '🎬 Reel', carousel: '🖼 Carousel', photo: '📷 Photo' };

export default function SocialWeekPlan() {
  const [state, setState] = useState(null); // { plan, done }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    fetch('/api/social-plan')
      .then((res) => res.json())
      .then((d) => (d.error ? setError(d.error) : setState(d)))
      .catch(() => setError('Could not load the plan.'));
  }, []);

  async function generate() {
    if (state?.plan && !confirm("Replace this week's ideas with new ones?")) return;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/social-plan', { method: 'POST' });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(d.error || 'Could not make the plan.');
    setState(d);
  }

  if (!state && !error) return null;
  const plan = state?.plan;
  const done = state?.done || {};

  return (
    <div className="card social-card social-plan">
      <div className="social-plan-head">
        <strong>📅 This week</strong>
        <button type="button" className="social-link-button" onClick={generate} disabled={busy}>
          {busy ? '✨ Planning…' : plan ? '↻ New ideas' : '✨ Plan this week'}
        </button>
        {plan?.notes && <span className="visit-meta social-plan-note">{plan.notes}</span>}
      </div>
      {error && <p className="error">{error}</p>}
      {!plan && !busy && <p className="visit-meta">No plan yet. The AI suggests 3 or 4 posts from what&apos;s happening at the clinic, with what to film.</p>}
      {plan && (
        <ul className="social-plan-list">
          {plan.ideas.map((idea, n) => {
            const post = done[n];
            const key = `${plan.week_start}:${n}`;
            return (
              <li key={key} className={`social-plan-idea${post ? ' social-plan-done' : ''}`}>
                <button type="button" className="social-plan-row" onClick={() => setOpen(open === n ? null : n)} aria-expanded={open === n}>
                  <span className="social-plan-day">{idea.day.slice(0, 3)}</span>
                  <span className="social-plan-title">{idea.title}</span>
                  <span className="social-chip">{FORMAT[idea.format] || idea.format}</span>
                  {post && <span className="social-chip social-consent-yes">✓ {post.status === 'posted' ? 'Posted' : 'Made'}</span>}
                </button>
                {open === n && (
                  <div className="social-plan-detail">
                    <p className="visit-meta">{idea.why}</p>
                    <ul className="social-plan-shots">
                      {idea.shots.map((shot) => (
                        <li key={shot}>{shot}</li>
                      ))}
                    </ul>
                    {post ? (
                      <a href={`/social/${post.id}`} className="social-link-button">Open the post</a>
                    ) : (
                      <a href={`/social/new?idea=${encodeURIComponent(key)}`} className="button-link">＋ Upload for this</a>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
