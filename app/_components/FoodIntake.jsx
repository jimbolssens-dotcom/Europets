// app/_components/FoodIntake.jsx
// The food intake graphs for a hospital stay (lib/feeding.js, data from
// /api/hospitalizations/:id/feeding): one bar per day, % of the daily energy
// target, pink = force-fed (measured), blue = ate by itself (rated: "a
// little" a quarter, "ate well" full). Used by the Feeding tile
// (FeedingPanel.jsx), the stay header (FeedingMicro, last 7 days, next to
// weight and temperature) and the owner's portal (FoodIntakeChart dark).
//
// Long stays: "2 weeks" (default) and "1 month" stay one bar per day; "Whole
// stay" switches to one bar per week (the week's average) once the stay is
// longer than 6 weeks, so a 60-day stay is 9 readable bars. Tap a bar to see
// that day's feeds (or, for a week, to open its days).

'use client';

import { useEffect, useMemo, useState } from 'react';
import { APPETITE_LABELS, feedingFood } from '@/lib/feeding';

export const FEED_COLORS = { fed: '#d6336c', self: '#2f6fd6' };
export const FEEDING_CHANGED = 'europets:feeding-changed';

// One shared fetch per stay; any component that logs a feed fires
// FEEDING_CHANGED and every graph on the page reloads.
export function useStayFeeding(hospitalizationId) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!hospitalizationId) return undefined;
    let alive = true;
    const load = () =>
      fetch(`/api/hospitalizations/${hospitalizationId}/feeding`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setData(d))
        .catch(() => {});
    load();
    const onChange = (e) => {
      if (!e.detail || e.detail === hospitalizationId) load();
    };
    window.addEventListener(FEEDING_CHANGED, onChange);
    return () => {
      alive = false;
      window.removeEventListener(FEEDING_CHANGED, onChange);
    };
  }, [hospitalizationId]);
  return data;
}

const shortDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function dayTip(d, targetKcal) {
  const parts = [];
  if (d.fedKcal > 0) parts.push(`force-fed ${d.fedMl ? `${d.fedMl} ml = ` : ''}${Math.round(d.fedKcal)} kcal (${d.fedPct}% of ${targetKcal} kcal)`);
  parts.push(`by itself: ${d.appetite ? APPETITE_LABELS[d.appetite] : 'not logged'}`);
  return `${d.today ? 'Today so far' : shortDate(d.date)}: ${parts.join(' · ')}`;
}

// Bars: [{ key, fed, self, label, tip, partial }] in % of target.
function BarSvg({ bars, width, height, labelEvery = 1, dark = false, onPick, picked }) {
  const ink = dark ? '#b7aebb' : '#6b6670';
  const strong = dark ? '#f3eef3' : '#1d1b20';
  const grid = dark ? '#3a3340' : '#ece6ea';
  const L = 44, R = 6, T = 10, B = 26;
  const plotH = height - T - B;
  const top = Math.max(125, ...bars.map((b) => b.fed + b.self + 5));
  const y = (p) => height - B - (p / top) * plotH;
  const slot = (width - L - R) / Math.max(1, bars.length);
  const bw = Math.max(3, Math.min(44, slot * 0.72));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="food-intake-svg" role="img" aria-label="Food intake per day">
      <line x1={L} x2={width - R} y1={y(0)} y2={y(0)} stroke={grid} />
      <line x1={L} x2={width - R} y1={y(50)} y2={y(50)} stroke={grid} strokeOpacity="0.6" />
      <text x={L - 6} y={y(0) + 4} fontSize="11" fill={ink} textAnchor="end">0</text>
      <text x={L - 6} y={y(50) + 4} fontSize="11" fill={ink} textAnchor="end">50%</text>
      <line x1={L} x2={width - R} y1={y(100)} y2={y(100)} stroke={dark ? '#6f6676' : '#8a8490'} strokeDasharray="5 4" />
      <text x={L - 6} y={y(100) + 4} fontSize="11" fill={strong} textAnchor="end">Target</text>
      {bars.map((b, i) => {
        const x = L + i * slot + (slot - bw) / 2;
        const fedTop = y(b.fed);
        const gap = b.fed && b.self ? 2 : 0;
        const selfH = y(0) - y(b.self);
        const isPicked = picked === b.key;
        return (
          <g key={b.key} onClick={onPick ? () => onPick(b.key) : undefined} style={onPick ? { cursor: 'pointer' } : undefined}>
            <title>{b.tip}</title>
            <rect x={x - 2} y={T} width={bw + 4} height={plotH} fill="transparent" />
            {isPicked && <rect x={x - 3} y={T} width={bw + 6} height={plotH} fill={dark ? '#ffffff14' : '#f6eef2'} rx="4" />}
            {b.fed > 0 && <rect x={x} y={fedTop} width={bw} height={y(0) - fedTop} fill={FEED_COLORS.fed} opacity={b.partial ? 0.6 : 1} />}
            {b.self > 0 && (
              <rect x={x} y={fedTop - gap - selfH} width={bw} height={selfH} fill={FEED_COLORS.self} rx={bw > 8 ? 3 : 1} opacity={b.partial ? 0.55 : 1} />
            )}
            {b.fed === 0 && b.self === 0 && <rect x={x} y={y(0) - 2} width={bw} height="2" fill={grid} />}
            {/* Counted back from the newest bar, so Today is always labelled. */}
            {(bars.length - 1 - i) % labelEvery === 0 && (
              <text x={x + bw / 2} y={height - B + 15} fontSize="11" fill={ink} textAnchor="middle">
                {b.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

const dayBars = (days, targetKcal) =>
  days.map((d) => ({ key: d.date, fed: d.fedPct, self: d.selfPct, label: d.today ? 'Today' : shortDate(d.date), tip: dayTip(d, targetKcal), partial: d.today }));

const PERIODS = [
  { key: '2w', label: '2 weeks', days: 14 },
  { key: '1m', label: '1 month', days: 31 },
  { key: 'all', label: 'Whole stay', days: Infinity },
];

export function FoodIntakeLegend({ dark = false, owner = false }) {
  return (
    <div className={`food-intake-legend${dark ? ' dark' : ''}`}>
      <span>
        <i style={{ background: FEED_COLORS.fed }} />
        {owner ? 'Fed by syringe by our team' : 'Force-fed (% of energy target)'}
      </span>
      <span>
        <i style={{ background: FEED_COLORS.self }} />
        {owner ? 'Eating by itself' : 'Ate by itself (a little ≈ ¼, well = full)'}
      </span>
      {!owner && <span>┄ Target</span>}
    </div>
  );
}

// The full graph with its period switch, and the picked day's feeds below.
export function FoodIntakeChart({ data, dark = false, owner = false, initialPeriod = '2w', periods = true }) {
  const [period, setPeriod] = useState(initialPeriod);
  const [picked, setPicked] = useState(null);
  const days = data?.days || [];
  const view = useMemo(() => {
    const p = PERIODS.find((x) => x.key === period) || PERIODS[0];
    if (p.key === 'all' && days.length > 42) {
      return {
        weekly: true,
        bars: (data.weeks || []).map((w) => ({
          key: `w${w.week}`,
          fed: w.fedPct,
          self: w.selfPct,
          label: `Wk ${w.week}`,
          tip: `Week ${w.week} (${shortDate(w.from)} to ${shortDate(w.to)}): force-fed ${w.fedPct}% of target on average · by itself ${w.selfPct}%`,
        })),
      };
    }
    const shown = Number.isFinite(p.days) ? days.slice(-p.days) : days;
    return { weekly: false, bars: dayBars(shown, data?.targetKcal) };
  }, [period, days, data]);

  if (!data) return null;
  if (!days.some((d) => d.fedKcal > 0 || d.appetite)) {
    return <p className="note-empty">No feeding logged yet.</p>;
  }

  const n = view.bars.length;
  const labelEvery = n > 21 ? 4 : n > 10 ? 2 : 1;
  const onPick = (key) => {
    if (view.weekly) {
      // A week opens its days: the month view lands on them.
      setPeriod('1m');
      setPicked(null);
      return;
    }
    setPicked(key === picked ? null : key);
  };
  const pickedDay = picked && days.find((d) => d.date === picked);

  return (
    <div className={`food-intake${dark ? ' dark' : ''}`}>
      {periods && days.length > 14 && (
        <div className="food-intake-periods" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" className={period === p.key ? 'on' : ''} onClick={() => { setPeriod(p.key); setPicked(null); }}>
              {p.label}
            </button>
          ))}
        </div>
      )}
      <FoodIntakeLegend dark={dark} owner={owner} />
      <BarSvg bars={view.bars} width={owner ? 380 : 640} height={owner ? 150 : 210} labelEvery={labelEvery} dark={dark} onPick={onPick} picked={picked} />
      {view.weekly && <p className="food-intake-hint">One bar per week (the average). Tap a week to see its days.</p>}
      {pickedDay && !owner && (
        <ul className="food-intake-feeds">
          <li className="food-intake-feeds-head">{dayTip(pickedDay, data.targetKcal)}</li>
          {pickedDay.feeds.map((f, i) => (
            <li key={i}>
              <span className="dot" style={{ background: f.kind === 'forced' ? FEED_COLORS.fed : FEED_COLORS.self }} />
              {new Date(f.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' })}{' '}
              {f.kind === 'forced'
                ? `force-fed ${f.ml} ml ${feedingFood(f.food)?.name || ''} (${Math.round(f.kcal)} kcal)`
                : `by itself: ${APPETITE_LABELS[f.appetite]}`}
              {f.by ? ` · ${f.by}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Header micro-graph: the last 7 days, the same size as weight/temperature.
export function FeedingMicro({ data }) {
  const days = (data?.days || []).slice(-7);
  if (!days.some((d) => d.fedKcal > 0 || d.appetite)) return null;
  const W = 120, H = 32, base = 31, scale = 25 / 100, slot = (W - 4) / 7, bw = 12;
  const today = days[days.length - 1];
  const title = `Food intake, last ${days.length} days. Today: ${today.fedKcal > 0 ? `force-fed ${today.fedPct}% of target, ` : ''}by itself ${today.appetite ? APPETITE_LABELS[today.appetite] : 'not logged'}`;
  return (
    <span className="patient-trend" title={title}>
      <span aria-hidden="true">🍽️</span>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        <line x1="2" x2={W - 2} y1={base - 100 * scale} y2={base - 100 * scale} stroke="#b9b2b8" strokeDasharray="2 2" />
        {days.map((d, i) => {
          const x = 4 + i * slot;
          const fh = Math.min(d.fedPct, 120) * scale;
          const sh = d.selfPct * scale;
          return (
            <g key={d.date} opacity={d.today ? 0.6 : 1}>
              {fh > 0 && <rect x={x} y={base - fh} width={bw} height={fh} fill={FEED_COLORS.fed} />}
              {sh > 0 && <rect x={x} y={base - fh - (fh ? 1.5 : 0) - sh} width={bw} height={sh} fill={FEED_COLORS.self} rx="1.5" />}
              {fh === 0 && sh === 0 && <rect x={x} y={base - 1} width={bw} height="1" fill="#d8d2d6" />}
            </g>
          );
        })}
      </svg>
    </span>
  );
}

// The owner's "Eating" card on the client portal's stay page: a plain-words
// line for today and the last 7 days, with the whole stay a tap away.
export function OwnerEatingCard({ hospitalizationId, petName }) {
  const data = useStayFeeding(hospitalizationId);
  const [whole, setWhole] = useState(false);
  const days = data?.days || [];
  if (!days.some((d) => d.fedKcal > 0 || d.appetite)) return null;
  const name = petName || 'Your pet';
  const today = days[days.length - 1];
  const parts = [];
  if (today.fedKcal > 0) parts.push(`we gave ${name} ${today.fedPct}% of the day's energy needs by syringe`);
  if (today.appetite === 'good') parts.push(`${name} is eating well by itself 🎉`);
  else if (today.appetite === 'reduced') parts.push(`${name} is eating a little by itself`);
  else if (today.appetite === 'none') parts.push(`${name} isn't eating by itself yet`);
  const line = parts.length ? `Today ${parts.join(', and ')}.` : 'Nothing logged yet today.';
  const shown = whole ? data : { ...data, days: days.slice(-7) };
  return (
    <div className="portal-card food-intake-card">
      <h2>🍽️ Eating</h2>
      <p>{line}</p>
      <FoodIntakeChart key={whole ? 'all' : '7'} data={shown} owner periods={whole} initialPeriod={whole ? 'all' : '2w'} />
      {days.length > 7 && (
        <button type="button" className="rare-link" onClick={() => setWhole((v) => !v)}>
          {whole ? 'Show the last 7 days' : `See the whole stay (${days.length} days) →`}
        </button>
      )}
    </div>
  );
}
