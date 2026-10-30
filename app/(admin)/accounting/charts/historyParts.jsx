// app/(admin)/accounting/charts/historyParts.jsx
// The long-run charts on the Accounting Charts page: the old system's
// float sheets (Mar 2023 to Sep 2026) joined to the app's own figures
// (lib/floatHistory.js, app/api/accounting/history). Lines per year, one
// run of every month, bars above or below zero for net profit, and each
// month's payment methods as shares.

'use client';

import { short, aed, useWidth, niceMax } from '../chartParts';

export const YEAR_COLORS = ['var(--chart-neutral)', 'var(--chart-4)', 'var(--chart-3)', 'var(--chart-1)'];
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const METHODS = [
  { key: 'card', label: 'Card', color: 'var(--chart-1)' },
  { key: 'cash', label: 'Cash', color: 'var(--chart-2)' },
  { key: 'online', label: 'Online / transfer', color: 'var(--chart-3)' },
];

export const signed = (v) => (v < 0 ? `-${short(-v)}` : short(v));
export const monthLabel = (key, withYear = true) => {
  const [y, m] = key.split('-');
  return withYear ? `${MONTH_NAMES[Number(m) - 1]} ${y.slice(2)}` : MONTH_NAMES[Number(m) - 1];
};
export const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
export const change = (p) => (p == null ? '' : `${p > 0 ? '+' : ''}${p}%`);

// One line per series over the same labels; a missing value breaks the line.
export function LineChart({ labels, lines, height = 220, every }) {
  const [ref, width] = useWidth();
  const L = 38, B = height - 22, T = 12, R = 6;
  const max = niceMax(Math.max(0, ...lines.flatMap((l) => l.values.filter((v) => v != null))));
  const step = width > L + R ? (width - L - R) / Math.max(1, labels.length - 1) : 0;
  const x = (i) => L + i * step;
  const y = (v) => B - (v / max) * (B - T);
  const gap = every || Math.max(1, Math.ceil(40 / Math.max(step, 1)));
  return (
    <div ref={ref} className="acct-chart">
      {width > 0 && (
        <svg width={width} height={height} role="img">
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={L} x2={width - R} y1={y(max * f)} y2={y(max * f)} className="acct-chart-gridline" />
              <text x={L - 5} y={y(max * f) + 4} textAnchor="end">{short(max * f)}</text>
            </g>
          ))}
          {labels.map((label, i) =>
            (labels.length - 1 - i) % gap === 0 ? (
              <text key={label} x={x(i)} y={B + 15} textAnchor="middle">{label}</text>
            ) : null
          )}
          {lines.map((line) => {
            let d = '';
            line.values.forEach((v, i) => {
              if (v == null) return;
              d += `${d && line.values[i - 1] != null ? 'L' : 'M'}${x(i)},${y(v)}`;
            });
            return (
              <g key={line.key}>
                <path d={d} fill="none" stroke={line.color} strokeWidth={line.bold ? 2.5 : 1.8} strokeLinejoin="round" />
                {line.values.map((v, i) =>
                  v == null ? null : (
                    <circle key={i} cx={x(i)} cy={y(v)} r={line.bold ? 3 : 2.2} fill={line.color}>
                      <title>{`${labels[i]} · ${line.label}: ${aed(v)}`}</title>
                    </circle>
                  )
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// Bars above or below zero, e.g. net profit.
export function SignedBars({ labels, values, height = 190, color = 'var(--chart-3)', negative = 'var(--chart-2)', titles }) {
  const [ref, width] = useWidth();
  const L = 38, B = height - 22, T = 12;
  const shown = values.filter((v) => v != null);
  const top = niceMax(Math.max(0, ...shown));
  const bottom = niceMax(Math.max(0, ...shown.map((v) => -v)));
  const span = top + (bottom > 1 ? bottom : 0);
  const zero = T + (top / span) * (B - T);
  const scale = (B - T) / span;
  const step = width > L ? (width - L) / labels.length : 0;
  const barW = Math.max(2, Math.min(18, step * 0.7));
  const gap = Math.max(1, Math.ceil(40 / Math.max(step, 1)));
  return (
    <div ref={ref} className="acct-chart">
      {width > 0 && (
        <svg width={width} height={height} role="img">
          <line x1={L} x2={width} y1={zero} y2={zero} className="acct-chart-gridline" />
          <text x={L - 5} y={zero + 4} textAnchor="end">0</text>
          <text x={L - 5} y={T + 4} textAnchor="end">{short(top)}</text>
          {bottom > 1 && <text x={L - 5} y={B + 4} textAnchor="end">{signed(-bottom)}</text>}
          {labels.map((label, i) => {
            const v = values[i];
            const cx = L + i * step + step / 2;
            return (
              <g key={label}>
                {v != null && (
                  <rect x={cx - barW / 2} y={v >= 0 ? zero - v * scale : zero} width={barW} height={Math.max(1, Math.abs(v) * scale)} rx={Math.min(3, barW / 2)} fill={v >= 0 ? color : negative}>
                    <title>{titles ? titles[i] : `${label}: ${aed(v)}`}</title>
                  </rect>
                )}
                {(labels.length - 1 - i) % gap === 0 && <text x={cx} y={height - 7} textAnchor="middle">{label}</text>}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// Each month's takings split by method, as shares of 100%.
export function ShareBars({ labels, rows, height = 170 }) {
  const [ref, width] = useWidth();
  const L = 30, B = height - 22, T = 6;
  const step = width > L ? (width - L) / labels.length : 0;
  const barW = Math.max(3, Math.min(22, step * 0.75));
  const gap = Math.max(1, Math.ceil(40 / Math.max(step, 1)));
  return (
    <div ref={ref} className="acct-chart">
      {width > 0 && (
        <svg width={width} height={height} role="img">
          {[0, 0.5, 1].map((f) => (
            <text key={f} x={L - 5} y={B - f * (B - T) + 4} textAnchor="end">{`${f * 100}%`}</text>
          ))}
          {labels.map((label, i) => {
            const row = rows[i];
            const total = METHODS.reduce((t, m) => t + row[m.key], 0) || 1;
            let acc = 0;
            const cx = L + i * step + step / 2;
            return (
              <g key={label}>
                {METHODS.map((m) => {
                  const share = row[m.key] / total;
                  const h = share * (B - T);
                  const yTop = B - acc - h;
                  acc += h;
                  return (
                    <rect key={m.key} x={cx - barW / 2} y={yTop} width={barW} height={h} fill={m.color}>
                      <title>{`${label} · ${m.label}: ${Math.round(share * 100)}% (${aed(row[m.key])})`}</title>
                    </rect>
                  );
                })}
                {(labels.length - 1 - i) % gap === 0 && <text x={cx} y={height - 7} textAnchor="middle">{label}</text>}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export function Kpi({ label, value, note }) {
  return (
    <div className="acct-history-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <em>{note}</em>}
    </div>
  );
}
