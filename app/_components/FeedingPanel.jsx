// app/_components/FeedingPanel.jsx
// The Feeding tile on a hospital stay, next to Temperature and Weight in
// the Day Treatment Plan (both the desktop stay page and the nurses' phone
// page use DayTreatmentPlan). Today's force feeding against the energy
// target, today's appetite, "+ Log Feeding", and the Food intake graph
// (FoodIntake.jsx). Each feed is a normal worksheet entry
// (POST /api/hospitalizations/:id/notes with feed_kind, see lib/feeding.js).

'use client';

import { useState } from 'react';
import { APPETITE_LABELS, FEEDING_FOODS, FORCE_FEED_ML_CHOICES, forceFeedKcal } from '@/lib/feeding';
import { FEEDING_CHANGED, FoodIntakeChart, useStayFeeding } from './FoodIntake';

const APPETITE_CHOICES = [
  { value: 'none', icon: '🚫', label: 'Not eating' },
  { value: 'reduced', icon: '🥄', label: 'A little' },
  { value: 'good', icon: '🍽️', label: 'Ate well' },
];

function todayISODate() {
  return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default function FeedingPanel({ hospitalizationId, authorId, onLogged }) {
  const data = useStayFeeding(hospitalizationId);
  const [open, setOpen] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [kind, setKind] = useState('forced');
  const [ml, setMl] = useState(null);
  const [otherMl, setOtherMl] = useState('');
  const [food, setFood] = useState(FEEDING_FOODS[0].key);
  const [appetite, setAppetite] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetDraft, setTargetDraft] = useState('');

  const today = data?.days?.[data.days.length - 1];
  const target = data?.targetKcal;
  const chosenMl = ml === 'other' ? Number(otherMl) : ml;
  const thisKcal = kind === 'forced' ? forceFeedKcal(chosenMl, food) : null;
  const afterKcal = today && thisKcal ? Math.round(today.fedKcal + thisKcal) : null;
  const lastFeed = today?.feeds?.[today.feeds.length - 1];

  function reset() {
    setMl(null);
    setOtherMl('');
    setAppetite(null);
    setError(null);
  }

  async function save() {
    setError(null);
    const body =
      kind === 'forced'
        ? { feed_kind: 'forced', feed_ml: chosenMl, feed_food: food }
        : { feed_kind: 'self', appetite };
    if (kind === 'forced' && !thisKcal) return setError('Choose how many ml went in.');
    if (kind === 'self' && !appetite) return setError('Choose how it ate.');
    setSaving(true);
    try {
      const res = await fetch(`/api/hospitalizations/${hospitalizationId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author_id: authorId || null, note_date: todayISODate(), ...body }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Could not save the feed');
      reset();
      setOpen(false);
      window.dispatchEvent(new CustomEvent(FEEDING_CHANGED, { detail: hospitalizationId }));
      onLogged?.(out);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveTarget(value) {
    setError(null);
    const res = await fetch(`/api/hospitalizations/${hospitalizationId}/feeding`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ energy_target_kcal: value }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return setError(out.error || 'Could not save the target');
    setEditingTarget(false);
    window.dispatchEvent(new CustomEvent(FEEDING_CHANGED, { detail: hospitalizationId }));
  }

  const fedPct = today?.fedPct || 0;

  return (
    <>
    <div className={`day-plan-vitals-tile feeding-tile${today?.fedKcal || today?.appetite ? ' done' : ''}`}>
      <div className="day-plan-vitals-top">
        <span className="day-plan-task-label">Feeding 🍽️</span>
        <span className="day-plan-task-status">
          {today?.fedKcal > 0 ? (
            <>
              Force-fed today: <b>{Math.round(today.fedKcal)} of {target} kcal</b> ({fedPct}%)
            </>
          ) : (
            'No syringe feeding today'
          )}
          {' · '}By itself: <b>{today?.appetite ? APPETITE_LABELS[today.appetite] : 'not logged'}</b>
        </span>
        {today?.fedKcal > 0 && (
          <span className="feeding-meter" title={`${fedPct}% of the energy target`}>
            <i style={{ width: `${Math.min(100, fedPct)}%` }} />
          </span>
        )}
        {lastFeed && (
          <span className="day-plan-task-status">
            Last: {new Date(lastFeed.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' })}
            {lastFeed.by ? ` · ${lastFeed.by}` : ''}
          </span>
        )}
      </div>

      {open ? (
        <div className="feeding-form">
          <div className="feeding-kind" role="group" aria-label="Kind of feed">
            <button type="button" className={kind === 'forced' ? 'on forced' : ''} onClick={() => setKind('forced')}>💉 Force-fed</button>
            <button type="button" className={kind === 'self' ? 'on self' : ''} onClick={() => setKind('self')}>🍽️ Ate by itself</button>
          </div>
          {kind === 'forced' ? (
            <>
              <div className="feeding-chips">
                {FORCE_FEED_ML_CHOICES.map((v) => (
                  <button key={v} type="button" className={ml === v ? 'on' : ''} onClick={() => setMl(v)}>{v} ml</button>
                ))}
                <button type="button" className={ml === 'other' ? 'on' : ''} onClick={() => setMl('other')}>other…</button>
                {ml === 'other' && (
                  <input type="number" min="1" step="1" inputMode="numeric" autoFocus placeholder="ml" value={otherMl} onChange={(e) => setOtherMl(e.target.value)} />
                )}
              </div>
              <select className="feeding-food" value={food} onChange={(e) => setFood(e.target.value)} aria-label="Food">
                {FEEDING_FOODS.map((f) => (
                  <option key={f.key} value={f.key}>{f.name} · {f.kcalPerMl.toFixed(1)} kcal/ml</option>
                ))}
              </select>
              <p className="feeding-note">
                {thisKcal ? (
                  <>
                    {chosenMl} ml = <b>{thisKcal} kcal</b>
                    {target ? <> · today <b>{afterKcal} of {target} kcal</b> ({Math.round((afterKcal / target) * 100)}%) after this feed</> : null}
                  </>
                ) : (
                  'Choose how many ml went in.'
                )}
              </p>
            </>
          ) : (
            <div className="feeding-appetite">
              {APPETITE_CHOICES.map((c) => (
                <button key={c.value} type="button" className={appetite === c.value ? 'on' : ''} onClick={() => setAppetite(c.value)}>
                  <span aria-hidden="true">{c.icon}</span>
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {error && <p className="error">{error}</p>}
          <div className="feeding-actions">
            <button type="button" className="pill-btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" className="rare-link" onClick={() => { reset(); setOpen(false); }} disabled={saving}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="feeding-buttons">
          <button type="button" className="pill-btn" onClick={() => setOpen(true)}>+ Log Feeding</button>
          <button type="button" className="rare-link" onClick={() => setShowGraph((v) => !v)}>{showGraph ? 'Hide graph' : '📈 Graph'}</button>
        </div>
      )}

      <p className="feeding-target">
        {editingTarget ? (
          <>
            Target{' '}
            <input type="number" min="10" step="1" inputMode="numeric" value={targetDraft} onChange={(e) => setTargetDraft(e.target.value)} aria-label="Daily energy target in kcal" /> kcal/day{' '}
            <button type="button" className="rare-link" onClick={() => saveTarget(targetDraft || null)}>Save</button>{' '}
            {data?.targetSource === 'custom' && (
              <button type="button" className="rare-link" onClick={() => saveTarget(null)}>Back to RER</button>
            )}
          </>
        ) : target ? (
          <>
            Energy target <b>{target} kcal/day</b>
            {data.targetSource === 'rer' ? ` (RER for ${data.weightKg} kg)` : ' (set for this stay)'}{' '}
            <button type="button" className="rare-link" onClick={() => { setTargetDraft(String(target)); setEditingTarget(true); }}>change</button>
          </>
        ) : (
          <>
            No weight yet, so no energy target.{' '}
            <button type="button" className="rare-link" onClick={() => { setTargetDraft(''); setEditingTarget(true); }}>Set one</button>
          </>
        )}
      </p>

    </div>
    {/* The graph opens on its own full-width row under the tiles. */}
    {showGraph && (
      <div className="feeding-graph-row">
        <FoodIntakeChart data={data} />
      </div>
    )}
    </>
  );
}
