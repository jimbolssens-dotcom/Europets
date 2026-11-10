// app/_components/HomeCareCard.jsx
// 🏠 Home care (Jim, 10 Nov): the short "what to do at home" list for the
// owner, on a consult, a day procedure and a hospital stay. Medicines are
// filled in from what was dispensed (with the label's instructions), the
// rest is a tap on a chip or a template. Saved, it shows on the pet in the
// client app as a daily checklist (app/client-app/pets/[id]); nothing is
// sent by WhatsApp. See lib/homeCare.js and app/api/home-care.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HOME_CARE_TASKS, HOME_CARE_WATCH, HOME_CARE_TEMPLATES, MAX_TIMES_PER_DAY,
  applyTemplate, newKey, taskItem, watchItem, planLastDay,
} from '@/lib/homeCare';

function shortDate(iso) {
  return iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
}
function whenLabel(ts) {
  return new Date(ts).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' });
}

export default function HomeCareCard({ visitId = null, hospitalizationId = null, reloadKey = 0 }) {
  const [data, setData] = useState(null);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [ownText, setOwnText] = useState('');
  const [ownKind, setOwnKind] = useState('task');
  const [ownWatch, setOwnWatch] = useState('');

  const query = visitId ? `visit_id=${visitId}` : `hospitalization_id=${hospitalizationId}`;
  const loadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/home-care?${query}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setData(d);
        // The list itself only on the first load: a reload (a medicine was
        // dispensed meanwhile) keeps what's being edited and offers the new
        // medicine as a "+ add" chip instead.
        if (!loadedRef.current) setItems(d.plan ? d.plan.items : d.suggestedMeds || []);
        loadedRef.current = true;
        if (d.plan || d.suggestedMeds?.length) setOpen(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [query, reloadKey]);

  const saved = data?.plan || null;
  const dirty = useMemo(() => JSON.stringify(items) !== JSON.stringify(saved ? saved.items : []), [items, saved]);
  // Dispensed medicines not on the list yet (added to the consult after it was saved).
  const missingMeds = (data?.suggestedMeds || []).filter((m) => !items.some((i) => i.key === m.key));

  if (!data) return null;

  const meds = items.filter((i) => i.kind === 'med');
  const has = (key) => items.some((i) => i.key === key);
  const update = (key, patch) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const remove = (key) => setItems((prev) => prev.filter((i) => i.key !== key));
  const toggle = (item) => (has(item.key) ? remove(item.key) : setItems((prev) => [...prev, item]));

  async function save(nextItems = items) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/home-care', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visit_id: visitId, hospitalization_id: hospitalizationId, items: nextItems }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Could not save');
      setData((d) => ({ ...d, plan: out.plan }));
      setItems(out.plan ? out.plan.items : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="hc-card hc-card-closed">
        <span className="hc-title">🏠 Home care</span>
        <span className="hc-hint">Nothing for the owner to do at home yet.</span>
        <button type="button" className="hc-link" onClick={() => setOpen(true)}>+ Set up</button>
      </div>
    );
  }

  const next = data.nextVisit;

  return (
    <div className="hc-card">
      <div className="hc-head">
        <span className="hc-title">🏠 Home care</span>
        {saved && !dirty ? (
          <span className="hc-status hc-status-saved">✓ In the client app until {shortDate(planLastDay(saved))}</span>
        ) : (
          <span className="hc-status">{saved ? 'Changes not saved' : 'Not saved yet'}</span>
        )}
        <select
          className="hc-template"
          value=""
          onChange={(e) => e.target.value && setItems((prev) => applyTemplate(prev, e.target.value))}
          aria-label="Use a template"
        >
          <option value="">Template…</option>
          {HOME_CARE_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="hc-cols">
        <div>
          <div className="hc-sec">Medication at home</div>
          {meds.length === 0 && <p className="hc-hint">No medicines. Dispensed ones are added here by themselves.</p>}
          {meds.map((m) => (
            <div className="hc-med" key={m.key}>
              <div className="hc-med-text">
                <input className="hc-med-name" value={m.name} onChange={(e) => update(m.key, { name: e.target.value })} aria-label="Medicine" />
                <input className="hc-med-dose" value={m.dose || ''} placeholder="How much, how (e.g. ½ tablet with food)" onChange={(e) => update(m.key, { dose: e.target.value })} aria-label="Dose" />
              </div>
              <div className="hc-med-when">
                <span className="hc-seg" role="group" aria-label="Times a day">
                  {Array.from({ length: MAX_TIMES_PER_DAY }, (_, n) => n + 1).map((n) => (
                    <button key={n} type="button" className={m.times_per_day === n ? 'on' : ''} onClick={() => update(m.key, { times_per_day: n })}>
                      {n}×
                    </button>
                  ))}
                </span>
                <label className="hc-days">
                  <input type="number" min="1" max="365" inputMode="numeric" value={m.days || ''} onChange={(e) => update(m.key, { days: e.target.value === '' ? '' : Number(e.target.value) })} />
                  days
                </label>
                <button type="button" className="hc-x" onClick={() => remove(m.key)} aria-label={`Remove ${m.name}`}>×</button>
              </div>
            </div>
          ))}
          <div className="hc-chips">
            {missingMeds.map((m) => (
              <button key={m.key} type="button" className="hc-chip hc-chip-add" onClick={() => setItems((prev) => [...prev, m])}>+ {m.name}</button>
            ))}
            <button type="button" className="hc-chip hc-chip-add" onClick={() => setItems((prev) => [...prev, { key: newKey(), kind: 'med', name: '', dose: '', times_per_day: 1, days: 7 }])}>
              + medicine
            </button>
          </div>

          <div className="hc-sec">Do at home</div>
          <div className="hc-chips">
            {HOME_CARE_TASKS.map((t) => {
              const item = taskItem(t.id);
              const on = has(item.key);
              const current = items.find((i) => i.key === item.key);
              return (
                <button key={t.id} type="button" className={`hc-chip${on ? ' on' : ''}`} onClick={() => toggle(item)} title={t.kind === 'task' ? 'Ticked every day' : 'Keep doing'}>
                  {t.icon} {t.text}
                  {on && current?.days ? ` · ${current.days} d` : ''}
                </button>
              );
            })}
            {items
              .filter((i) => (i.kind === 'task' || i.kind === 'keep') && !HOME_CARE_TASKS.some((t) => `t_${t.id}` === i.key))
              .map((i) => (
                <button key={i.key} type="button" className="hc-chip on" onClick={() => remove(i.key)} title="Tap to remove">
                  {i.icon || (i.kind === 'task' ? '✅' : '•')} {i.text} ×
                </button>
              ))}
          </div>
          <form
            className="hc-own"
            onSubmit={(e) => {
              e.preventDefault();
              if (!ownText.trim()) return;
              setItems((prev) => [...prev, { key: newKey(), kind: ownKind, text: ownText.trim(), days: null }]);
              setOwnText('');
            }}
          >
            <input value={ownText} onChange={(e) => setOwnText(e.target.value)} placeholder="Own line, e.g. Clean the ear before the drops" maxLength={120} />
            <select value={ownKind} onChange={(e) => setOwnKind(e.target.value)} aria-label="Kind">
              <option value="task">tick daily</option>
              <option value="keep">keep doing</option>
            </select>
            <button type="submit" className="hc-link">Add</button>
          </form>
        </div>

        <div>
          <div className="hc-sec">Message us if</div>
          <div className="hc-chips">
            {HOME_CARE_WATCH.map((w) => {
              const item = watchItem(w.id);
              return (
                <button key={w.id} type="button" className={`hc-chip hc-chip-watch${has(item.key) ? ' on' : ''}`} onClick={() => toggle(item)}>
                  {w.text}
                </button>
              );
            })}
            {items
              .filter((i) => i.kind === 'watch' && !HOME_CARE_WATCH.some((w) => `w_${w.id}` === i.key))
              .map((i) => (
                <button key={i.key} type="button" className="hc-chip hc-chip-watch on" onClick={() => remove(i.key)} title="Tap to remove">
                  {i.text} ×
                </button>
              ))}
          </div>
          <form
            className="hc-own"
            onSubmit={(e) => {
              e.preventDefault();
              if (!ownWatch.trim()) return;
              setItems((prev) => [...prev, { key: newKey(), kind: 'watch', text: ownWatch.trim() }]);
              setOwnWatch('');
            }}
          >
            <input value={ownWatch} onChange={(e) => setOwnWatch(e.target.value)} placeholder="Own warning sign" maxLength={120} />
            <button type="submit" className="hc-link">Add</button>
          </form>

          <div className="hc-sec">Next visit</div>
          {next ? (
            <p className="hc-next">📅 <b>{whenLabel(next.start_time)}</b>{next.staff?.full_name ? ` · ${next.staff.full_name}` : ''}{next.reason ? ` · ${next.reason}` : ''}</p>
          ) : (
            <p className="hc-hint">No visit booked. One booked later shows here and in the app by itself.</p>
          )}
        </div>
      </div>

      <div className="hc-actions">
        <button type="button" onClick={() => save()} disabled={saving || (!dirty && !!saved) || items.length === 0}>
          {saving ? 'Saving…' : saved ? '✓ Save changes' : '✓ Save home care'}
        </button>
        {saved && (
          <button type="button" className="hc-link" disabled={saving} onClick={() => window.confirm('Remove the home care from the client app?') && save([])}>
            Remove
          </button>
        )}
        <span className="hc-hint">Shows on the pet in the client app. Not sent by WhatsApp.</span>
        {error && <span className="error">{error}</span>}
      </div>
    </div>
  );
}
