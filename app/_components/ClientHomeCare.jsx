// app/_components/ClientHomeCare.jsx
// The pet's 🏠 Home care in the client app (Jim, 10 Nov): today's short
// checklist from what the vet saved (tick each dose and task as it's
// done), what to keep doing, when to message us and the next visit, plus
// "+ Log something" for what the owner did themselves and a list of what
// they logged. See lib/homeCare.js and app/api/client-app/home-care.

'use client';

import { useCallback, useEffect, useState } from 'react';
import HomeCareLogSheet from './HomeCareLogSheet';
import { itemActiveOn, itemLastDay, logLine, planDayNumber, slotLabels, todayChecklist } from '@/lib/homeCare';

function dayLabel(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
function whenLabel(ts) {
  const d = new Date(ts);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
  const day = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' });
  return day === today ? `today ${time}` : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' })}`;
}

export default function ClientHomeCare({ pet }) {
  const [data, setData] = useState(null);
  // The owner's other pets, for "other pets too" when logging: loaded only
  // when the sheet opens (some owners have hundreds).
  const [allPets, setAllPets] = useState([]);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    fetch(`/api/client-app/home-care?patient_id=${pet.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && !d.error && setData(d))
      .catch(() => {});
  }, [pet.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function tick(plan, item, slot, done, logId) {
    setBusy(`${item.key}|${slot}`);
    setError(null);
    try {
      const res = done
        ? await fetch(`/api/client-app/home-care/logs?id=${logId}`, { method: 'DELETE' })
        : await fetch('/api/client-app/home-care/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tick: { plan_id: plan.id, item_key: item.key, slot } }),
          });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Could not save');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function removeLog(id) {
    if (!window.confirm('Remove this from the log?')) return;
    await fetch(`/api/client-app/home-care/logs?id=${id}`, { method: 'DELETE' }).catch(() => {});
    load();
  }

  if (!data) return null;
  const { plans = [], ticks = [], logs = [], today, nextVisit } = data;
  const ownLogs = logs.filter((l) => l.kind !== 'dose' && l.kind !== 'task');
  const others = allPets.filter((p) => p.id !== pet.id && !p.deceased && !p.rehomed);

  return (
    <>
      {plans.map((plan) => {
        const rows = todayChecklist(plan, ticks, today);
        const keep = (plan.items || []).filter((i) => i.kind === 'keep' && itemActiveOn(plan, i, today));
        const watch = (plan.items || []).filter((i) => i.kind === 'watch');
        const { day, total } = planDayNumber(plan, today);
        return (
          <div className="chc-card" key={plan.id}>
            <div className="chc-head">
              <span className="chc-title">🏠 Home care</span>
              <span className="chc-day">day {day} of {total}</span>
            </div>
            {rows.length > 0 && <div className="chc-sec">Today</div>}
            {rows.map(({ item, slots, lastDay }) => (
              <div className="chc-row" key={item.key}>
                <div className="chc-row-text">
                  <b>{item.kind === 'med' ? item.name : `${item.icon || '✅'} ${item.text}`}</b>
                  {item.kind === 'med' && item.dose ? <span> {item.dose}</span> : null}
                  <div className="chc-small">
                    {item.kind === 'med' ? slotLabels(item.times_per_day).join(' · ') : 'once today'}
                    {lastDay ? ` · until ${dayLabel(lastDay)}` : ''}
                  </div>
                </div>
                <div className="chc-ticks">
                  {slots.map((s) => {
                    const log = ticks.find((t) => t.plan_id === plan.id && t.item_key === item.key && t.for_date === today && (t.slot ?? 0) === s.slot);
                    return (
                      <button
                        key={s.slot}
                        type="button"
                        className={`chc-tick${s.done ? ' done' : ''}`}
                        title={s.label}
                        aria-label={`${item.name || item.text}, ${s.label}${s.done ? ', done' : ''}`}
                        disabled={busy === `${item.key}|${s.slot}`}
                        onClick={() => tick(plan, item, s.slot, s.done, log?.id)}
                      >
                        {s.done ? '✓' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {keep.length > 0 && (
              <>
                <div className="chc-sec">Keep doing</div>
                <div className="chc-chips">
                  {keep.map((k) => (
                    <span className="chc-chip" key={k.key}>
                      {k.icon ? `${k.icon} ` : ''}{k.text}{k.days ? ` until ${dayLabel(itemLastDay(plan, k))}` : ''}
                    </span>
                  ))}
                </div>
              </>
            )}
            {watch.length > 0 && (
              <>
                <div className="chc-sec">Message us if</div>
                <p className="chc-watch">{watch.map((w) => w.text).join(' · ')}</p>
              </>
            )}
            {nextVisit && (
              <p className="chc-next">📅 <b>{new Date(nextVisit.start_time).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' })}</b>{nextVisit.reason ? ` · ${nextVisit.reason}` : ''}</p>
            )}
          </div>
        );
      })}
      {error && <p className="client-app-login-error">{error}</p>}

      <div className="chc-actions">
        <button
          type="button"
          className="chc-log-btn"
          onClick={() => {
            setSheet(true);
            if (!allPets.length && pet.client_id) {
              fetch(`/api/patients?client_id=${pet.client_id}`)
                .then((r) => (r.ok ? r.json() : []))
                .then((list) => Array.isArray(list) && setAllPets(list))
                .catch(() => {});
            }
          }}
        >
          + Log something
        </button>
      </div>

      {ownLogs.length > 0 && (
        <>
          <p className="mobile-section-header">Logged by you</p>
          <div className="chc-logs">
            {ownLogs.slice(0, 15).map((l) => (
              <div className="chc-log" key={l.id}>
                <span className="chc-log-text">
                  {logLine(l)}
                  {l.note && l.kind !== 'note' ? <span className="chc-small"> · {l.note}</span> : null}
                  {l.photo_url ? <a href={l.photo_url} target="_blank" rel="noreferrer"> 📷</a> : null}
                </span>
                <span className="chc-small">{whenLabel(l.given_at)}</span>
                <button type="button" className="chc-x" onClick={() => removeLog(l.id)} aria-label="Remove">×</button>
              </div>
            ))}
          </div>
        </>
      )}

      {sheet && (
        <HomeCareLogSheet
          pets={[{ id: pet.id, name: pet.name, patient_number: pet.patient_number }, ...others.map((p) => ({ id: p.id, name: p.name, patient_number: p.patient_number }))]}
          selected={[pet.id]}
          onClose={() => setSheet(false)}
          onSaved={load}
        />
      )}
    </>
  );
}

