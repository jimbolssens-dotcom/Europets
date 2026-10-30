// app/(admin)/accounting/chartParts.jsx
// Pieces shared by the Accounting charts and History pages: plain SVG drawn
// at the width it's given (so text stays readable on a phone), every mark
// with its exact figure on hover or tap.

'use client';

import { useEffect, useRef, useState } from 'react';

export function short(v) {
  const x = Number(v || 0);
  if (x >= 100000) return `${Math.round(x / 1000)}k`;
  if (x >= 1000) return `${(x / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(x));
}
export const aed = (v) => `AED ${Number(v || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;

export function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((m) => m >= v);
}

// Horizontal bars, one per row, value at the end.
export function HBars({ rows, color = 'var(--chart-1)', format = aed }) {
  const [ref, width] = useWidth();
  const labelW = Math.min(130, Math.max(90, width * 0.32));
  const valueW = 92;
  const rowH = 30;
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (!rows.length) return <p className="visit-meta">Nothing in this period yet.</p>;
  return (
    <div ref={ref} className="acct-chart">
      {width > 0 && (
        <svg width={width} height={rows.length * rowH + 4} role="img">
          {rows.map((r, i) => {
            const w = Math.max(3, (r.value / max) * (width - labelW - valueW - 8));
            const yy = 4 + i * rowH;
            const rr = Math.min(4, w / 2);
            return (
              <g key={r.label}>
                <text x={labelW - 6} y={yy + 15} textAnchor="end" className="acct-chart-label">{r.label}</text>
                <path d={`M${labelW},${yy + 4}V${yy + 20}h${w - rr}q${rr},0 ${rr},${-rr}V${yy + 4 + rr}q0,${-rr} ${-rr},${-rr}z`} fill={r.color || color}>
                  <title>{`${r.label}: ${format(r.value)}${r.note ? ` ${r.note}` : ''}`}</title>
                </path>
                <text x={labelW + w + 6} y={yy + 15} className="acct-chart-value">
                  {short(r.value)}{r.note ? ` ${r.note}` : ''}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="acct-chart-legend">
      {items.map((s) => (
        <span key={s.label}><i style={{ background: s.color }} />{s.label}</span>
      ))}
    </div>
  );
}

export function Card({ title, why, wide, children }) {
  return (
    <section className={`card acct-chart-card${wide ? ' acct-chart-wide' : ''}`}>
      <h2>{title}</h2>
      {why && <p className="acct-chart-why">{why}</p>}
      {children}
    </section>
  );
}
