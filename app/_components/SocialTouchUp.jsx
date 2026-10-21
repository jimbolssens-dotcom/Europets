// app/_components/SocialTouchUp.jsx
// The Social draft's editing helpers (app/(admin)/social/[id]):
// - RemixButtons / RemixOptions: three new versions of a caption, the cover
//   text or a speech bubble from the AI (app/api/social-posts/[id]/remix),
//   to pick from. Nothing changes until staff tap one.
// - TouchUpPanel: one photo's touch-ups (lib/socialTouchUpPlan.js): a look,
//   the spot to keep in frame, the pet's speech bubble pointing at it, and
//   a sticker, with the photo as it'll go out next to it, drawn on the
//   server (lib/socialTouchUp.js) a moment after each change.

'use client';

import { useEffect, useState } from 'react';
import { LOOKS, STICKERS } from '@/lib/socialTouchUpPlan';
import { REMIX_TONES } from '@/lib/socialRemix';

export function RemixButtons({ onRemix, busyTone, disabled }) {
  return (
    <div className="social-remix" role="group" aria-label="Rewrite with the AI">
      {REMIX_TONES.map((t) => (
        <button key={t.key} type="button" className="social-chip-button" onClick={() => onRemix(t.key)} disabled={disabled}>
          {busyTone === t.key ? '✨ ...' : t.label}
        </button>
      ))}
    </div>
  );
}

export function RemixOptions({ remix, onPick, onClose }) {
  if (!remix) return null;
  return (
    <div className="social-remix-options">
      {remix.options ? (
        remix.options.map((o) => (
          <button key={o} type="button" className="social-remix-option" onClick={() => onPick(o)}>
            {o}
          </button>
        ))
      ) : (
        <span className="visit-meta">✨ Writing three versions...</span>
      )}
      <button type="button" className="social-link-button" onClick={onClose}>
        {remix.options ? 'Keep mine' : 'Cancel'}
      </button>
    </div>
  );
}

// The query for the cover route's preview of unsaved touch-ups.
function touchQuery(t) {
  const q = new URLSearchParams({ t: '1' });
  if (t.look) q.set('look', t.look);
  if (t.focus) {
    q.set('fx', t.focus.x);
    q.set('fy', t.focus.y);
  }
  if (t.bubble?.text?.trim()) {
    q.set('bt', t.bubble.text);
    q.set('bx', t.bubble.x);
    q.set('by', t.bubble.y);
  }
  if (t.sticker) q.set('st', t.sticker);
  return q.toString();
}

// item: the media item being touched up (with preview_url); headline: the
// cover text when it's the cover. onSave(touchUps) saves them on the post.
export function TouchUpPanel({ postId, index, item, number, headline, busy, onSave, onCancel, onRemix, remix, onCloseRemix }) {
  const [t, setT] = useState(() => ({
    look: item.look || null,
    focus: item.focus || null,
    bubble: item.bubble ? { ...item.bubble } : null,
    sticker: item.sticker || null,
  }));
  const [mode, setMode] = useState(item.bubble ? 'bubble' : 'focus');
  // The preview follows the changes after a short pause.
  const [shown, setShown] = useState(t);
  useEffect(() => {
    const timer = setTimeout(() => setShown(t), 500);
    return () => clearTimeout(timer);
  }, [t]);

  const bubbleText = t.bubble?.text || '';
  const setBubbleText = (text) => {
    setT((prev) => ({ ...prev, bubble: { x: prev.bubble?.x ?? 0.5, y: prev.bubble?.y ?? 0.4, text } }));
    if (!t.bubble) setMode('bubble');
  };

  function tap(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const p = { x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000, y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000 };
    if (mode === 'bubble' && bubbleText) setT((prev) => ({ ...prev, bubble: { ...prev.bubble, ...p } }));
    else setT((prev) => ({ ...prev, focus: p }));
  }

  const preview = `/api/social-posts/${postId}/cover?i=${index}&h=${encodeURIComponent(headline || '')}&${touchQuery(shown)}`;
  const changed = JSON.stringify(t) !== JSON.stringify({ look: item.look || null, focus: item.focus || null, bubble: item.bubble || null, sticker: item.sticker || null });

  return (
    <div className="social-touchup">
      <div className="social-touchup-head">
        <span className="social-field-label">✨ Photo {number}</span>
        <div className="social-touchup-actions">
          <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="social-primary" onClick={() => onSave({ ...t, bubble: bubbleText.trim() ? t.bubble : null })} disabled={busy || !changed}>
            {busy ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="social-touchup-pair">
        <figure>
          <div className="social-touchup-tap" onClick={tap} role="button" tabIndex={-1} aria-label={mode === 'bubble' && bubbleText ? 'Tap where the pet is' : 'Tap what to keep in frame'}>
            <img src={item.preview_url} alt="" draggable={false} />
            {t.focus && <span className="social-touchup-dot social-touchup-focus" style={{ left: `${t.focus.x * 100}%`, top: `${t.focus.y * 100}%` }} />}
            {bubbleText && t.bubble && <span className="social-touchup-dot social-touchup-pet" style={{ left: `${t.bubble.x * 100}%`, top: `${t.bubble.y * 100}%` }}>💬</span>}
          </div>
          <figcaption className="visit-meta">{mode === 'bubble' && bubbleText ? 'Tap the pet: the bubble points there' : 'Tap what must stay in the picture'}</figcaption>
        </figure>
        <figure>
          <img className="social-touchup-result" src={preview} alt="How it goes out" />
          <figcaption className="visit-meta">How it goes out</figcaption>
        </figure>
      </div>

      {bubbleText && (
        <div className="social-seg social-seg-small" role="tablist" aria-label="What a tap does">
          {[
            ['bubble', '💬 Pet is here'],
            ['focus', '🎯 Keep in frame'],
          ].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={mode === key} className={mode === key ? 'social-seg-on' : ''} onClick={() => setMode(key)}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="social-touchup-row" role="group" aria-label="Look">
        {[{ key: null, label: 'Original' }, ...LOOKS].map((l) => (
          <button key={l.key || 'none'} type="button" className={`social-chip-button${t.look === l.key ? ' social-chip-on' : ''}`} onClick={() => setT({ ...t, look: l.key })}>
            {l.label}
          </button>
        ))}
      </div>

      <div className="social-touchup-bubble">
        <input type="text" value={bubbleText} maxLength={60} onChange={(e) => setBubbleText(e.target.value)} placeholder="💬 What's the pet saying?" aria-label="Speech bubble" />
        <button type="button" className="social-chip-button" onClick={() => onRemix(bubbleText)} disabled={!!remix && !remix.options}>
          {remix && !remix.options ? '✨ ...' : '💡 Ideas'}
        </button>
        {bubbleText && (
          <button type="button" className="social-link-button" onClick={() => setT({ ...t, bubble: null })}>
            Remove
          </button>
        )}
      </div>
      <RemixOptions remix={remix} onPick={(o) => { setBubbleText(o); onCloseRemix(); }} onClose={onCloseRemix} />

      <div className="social-touchup-row" role="group" aria-label="Sticker">
        {[{ key: null, label: 'No sticker' }, ...STICKERS].map((s) => (
          <button key={s.key || 'none'} type="button" className={`social-chip-button${t.sticker === s.key ? ' social-chip-on' : ''}`} onClick={() => setT({ ...t, sticker: s.key })} title={s.title} aria-label={s.title || s.label}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
