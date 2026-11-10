// app/_components/OwnerLogs.jsx
// What owners log about their pet in the client app (home care, Jim,
// 10 Nov; lib/homeCare.js, migration 247), for staff:
// - OwnerLogsChip: "📝 Owner logged 6 since 2 Nov" on the consult, day
//   procedure and stay headers, linking to the list on the patient file;
// - OwnerLogsSection: that list on the patient file, with how many home
//   care doses were ticked. Nothing here is sent to anyone.

'use client';

import { useEffect, useState } from 'react';
import { logLine } from '@/lib/homeCare';

function useOwnerLogs(patientId, before) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!patientId) return undefined;
    let cancelled = false;
    fetch(`/api/home-care/owner-logs?patient_id=${patientId}${before ? `&before=${encodeURIComponent(before)}` : ''}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d && !d.error && setData(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [patientId, before]);
  return data;
}

function shortDay(ts) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' });
}
function when(ts) {
  const d = new Date(ts);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
  const day = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' });
  return day === today ? `today ${time}` : `${shortDay(ts)} ${time}`;
}

// `before`: the record's own start, so a consult shows what the owner
// logged between the previous visit and this one.
export function OwnerLogsChip({ patientId, before }) {
  const data = useOwnerLogs(patientId, before);
  if (!data || !data.sinceLastVisit) return null;
  return (
    <a className="patient-chip owner-logs-chip" href={`/patients/${patientId}#owner-logs`} title="What the owner logged in the client app">
      📝 Owner logged {data.sinceLastVisit}
      {data.lastVisitAt ? ` since ${shortDay(data.lastVisitAt)}` : ''}
    </a>
  );
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'meds', label: 'Medication', kinds: ['dose', 'task', 'medication', 'supplement'] },
  { id: 'parasites', label: 'Parasites', kinds: ['deworm', 'parasite'] },
  { id: 'vitals', label: 'Vitals', kinds: ['weight', 'temperature', 'eating'] },
  { id: 'notes', label: 'Notes', kinds: ['note'] },
];

export function OwnerLogsSection({ patientId }) {
  const data = useOwnerLogs(patientId);
  const [filter, setFilter] = useState('all');
  if (!data) return null;
  const logs = data.logs || [];
  const plans = data.plans || [];
  if (logs.length === 0 && plans.length === 0) return null;

  const planById = Object.fromEntries(plans.map((p) => [p.id, p]));
  const kinds = FILTERS.find((f) => f.id === filter)?.kinds;
  // Ticks are summed up per plan below rather than listed one by one.
  const shown = logs.filter((l) => l.kind !== 'dose' && l.kind !== 'task' && (!kinds || kinds.includes(l.kind)));
  const showPlans = !kinds || kinds.includes('dose');

  return (
    <section id="owner-logs" className="owner-logs">
      <div className="owner-logs-head">
        <h2>📝 From the owner</h2>
        <span className="owner-logs-sub">logged in the client app</span>
        <span className="owner-logs-filters">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </span>
      </div>
      {showPlans &&
        plans
          .filter((p) => p.adherence.expected > 0)
          .slice(0, 5)
          .map((p) => (
            <div className="owner-log" key={p.id}>
              <span className="owner-log-text">
                💊 Home care from {shortDay(`${p.starts_on}T12:00:00+04:00`)}: <b>{p.adherence.ticked} of {p.adherence.expected}</b> doses and tasks ticked
                {p.adherence.missed > 0 && <span className="owner-log-missed"> {p.adherence.missed} missed</span>}
              </span>
            </div>
          ))}
      {shown.map((l) => (
        <div className="owner-log" key={l.id}>
          <span className="owner-log-text">
            {logLine(l, planById[l.plan_id])}
            {l.note && l.kind !== 'note' ? <span className="owner-log-note"> · “{l.note}”</span> : null}
            {l.kind === 'temperature' && Number(l.value) > 39.5 && <span className="owner-log-missed"> high</span>}
            {l.photo_url && (
              <a href={l.photo_url} target="_blank" rel="noreferrer" className="owner-log-photo"> 📷 photo</a>
            )}
          </span>
          <span className="owner-log-when">{when(l.given_at)}</span>
        </div>
      ))}
      {shown.length === 0 && !showPlans && <p className="owner-logs-empty">Nothing logged here yet.</p>}
    </section>
  );
}
