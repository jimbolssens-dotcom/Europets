// app/(admin)/accounting/history/page.jsx
// Accounting History: the old system's float sheets (Mar 2023 to Sep 2026)
// set beside what the app has recorded since, for comparison only. Year on
// year takings, every month's takings, outgoing and net profit, how clients
// pay, the busiest days of the week and where the money went. Figures from
// app/api/accounting/history (lib/floatHistory.js).

'use client';

import { useEffect, useState } from 'react';
import { short, aed, useWidth, niceMax, HBars, Legend, Card } from '../chartParts';

const YEAR_COLORS = ['var(--chart-neutral)', 'var(--chart-4)', 'var(--chart-3)', 'var(--chart-1)'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const METHODS = [
  { key: 'card', label: 'Card', color: 'var(--chart-1)' },
  { key: 'cash', label: 'Cash', color: 'var(--chart-2)' },
  { key: 'online', label: 'Online / transfer', color: 'var(--chart-3)' },
];

const signed = (v) => (v < 0 ? `-${short(-v)}` : short(v));
const monthLabel = (key, withYear = true) => {
  const [y, m] = key.split('-');
  return withYear ? `${MONTH_NAMES[Number(m) - 1]} ${y.slice(2)}` : MONTH_NAMES[Number(m) - 1];
};
const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
const change = (p) => (p == null ? '' : `${p > 0 ? '+' : ''}${p}%`);

// One line per series over the same labels; a missing value breaks the line.
function LineChart({ labels, lines, height = 220, every }) {
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
function SignedBars({ labels, values, height = 190, color = 'var(--chart-3)', negative = 'var(--chart-2)', titles }) {
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
function ShareBars({ labels, rows, height = 170 }) {
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

function Kpi({ label, value, note }) {
  return (
    <div className="acct-history-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <em>{note}</em>}
    </div>
  );
}

export default function AccountingHistoryPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/accounting/history')
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch((e) => setError(e.message));
  }, []);

  const months = data?.months || [];
  const labels = months.map((m) => monthLabel(m.month));
  const mtd = data?.monthToDate;
  const [thisYear, ...earlier] = mtd?.rows || [];
  const methodMonths = months.filter((m) => m.hasMethods && m.takings > 0);
  const yoy = data?.yearOnYear;

  return (
    <div className="acct-charts">
      <div className="page-header">
        <h1>📜 History</h1>
        <div className="page-header-actions">
          <a href="/accounting/charts" className="button-link">📈 Charts</a>
          <a href="/accounting" className="button-link">← Accounting</a>
        </div>
      </div>
      <p className="acct-chart-why">
        The old system&apos;s float sheets from Mar 2023, then the app from {data ? monthLabel(data.appFirstFullMonth) : 'Oct 26'}. For comparison only: nothing here changes the app&apos;s own figures.
      </p>

      {error && <p className="error">{error}</p>}
      {!data && !error && <p>Loading...</p>}
      {data && (
        <>
          <div className="acct-history-kpis">
            {thisYear && (
              <Kpi
                label={`${monthLabel(mtd.month, false)} 1 to ${mtd.throughDay}`}
                value={aed(thisYear.total)}
                note={earlier.map((r) => `${r.year}: ${short(r.total)} (${change(pct(thisYear.total, r.total))})`).join(' · ') || 'No earlier year to compare'}
              />
            )}
            {data.trailing && (
              <Kpi
                label={`${monthLabel(data.trailing.from)} to ${monthLabel(data.trailing.to)}`}
                value={aed(data.trailing.takings)}
                note={`Year before: ${short(data.trailing.priorTakings)} (${change(pct(data.trailing.takings, data.trailing.priorTakings))})`}
              />
            )}
          </div>

          <div className="acct-chart-grid">
            <Card wide title="Takings, year on year" why="Everything taken each month, VAT included, a line per year. Tap a dot for the figure.">
              <Legend items={yoy.years.map((y, i) => ({ label: y, color: YEAR_COLORS[Math.max(0, YEAR_COLORS.length - yoy.years.length + i)] }))} />
              <LineChart
                labels={MONTH_NAMES}
                every={1}
                lines={yoy.years.map((y, i) => ({
                  key: y,
                  label: y,
                  color: YEAR_COLORS[Math.max(0, YEAR_COLORS.length - yoy.years.length + i)],
                  values: yoy.values[y],
                  bold: i === yoy.years.length - 1,
                }))}
              />
            </Card>

            <Card wide title="Every month: takings and outgoing" why="Outgoing is everything paid out: the float's stock, clinic use, staff and other, plus its fixed costs (WPS and cash salaries, sponsor, SEWA, landline), then the app's expenses from Sep 26.">
              <Legend items={[{ label: 'Takings', color: 'var(--chart-1)' }, { label: 'Outgoing', color: 'var(--chart-2)' }]} />
              <LineChart
                labels={labels}
                lines={[
                  { key: 't', label: 'Takings', color: 'var(--chart-1)', values: months.map((m) => m.takings || null), bold: true },
                  { key: 'o', label: 'Outgoing', color: 'var(--chart-2)', values: months.map((m) => m.outgoing || null) },
                ]}
              />
            </Card>

            <Card wide title="Net profit, by month" why="From the float: takings less outgoing (Dr Jim's salary included) and the fixed costs (WPS and cash salaries, sponsor, SEWA, landline). Red is a loss.">
              <SignedBars
                labels={labels}
                values={months.map((m) => m.netProfit)}
                titles={months.map((m) => (m.netProfit == null ? '' : `${monthLabel(m.month)}: ${aed(m.netProfit)} (fixed costs ${aed(m.fixedCosts)})${m.oneOff ? `, before the one-off ${aed(m.oneOff)}` : ''}`))}
              />
              {months.filter((m) => m.oneOff).map((m) => (
                <p key={m.month} className="visit-meta">
                  {monthLabel(m.month)} leaves out a one-off {aed(m.oneOff)}: {m.oneOffNote}.
                </p>
              ))}
            </Card>

            <Card title="How clients pay" why="Each month's takings by method, as a share. The float's PayPal/transfer column and the app's payment links and transfers count as online.">
              <Legend items={METHODS} />
              <ShareBars labels={methodMonths.map((m) => monthLabel(m.month))} rows={methodMonths} />
            </Card>

            <Card title="Busiest days of the week" why="Average takings on each day of the week, over every day the clinic took something.">
              <HBars rows={data.weekdays.map((d) => ({ label: d.label, value: d.value }))} />
            </Card>

            <Card wide title="Where the money went" why={`Average per month from the float, over the ${data.costs.months} months with the full cost side (Jan 25 to Aug 26).`}>
              <HBars rows={data.costs.rows} color="var(--chart-2)" />
            </Card>

            {data.corrections.length > 0 && (
              <Card wide title="Where the float's own totals were off" why="These months are added up from the float's daily rows; the sheet's own totals said otherwise.">
                <ul className="acct-history-notes">
                  {data.corrections.map((c) => (
                    <li key={c.month}>
                      <strong>{monthLabel(c.month)}</strong>
                      {c.sheetTakings != null && Math.abs(c.sheetTakings - c.takings) > 1 && ` takings ${aed(c.takings)}, the sheet says ${aed(c.sheetTakings)}.`}
                      {c.sheetNetProfit != null && c.netProfit != null && Math.abs(c.sheetNetProfit - c.netProfit) > 1 && ` Net profit ${aed(c.netProfit)}, the sheet says ${aed(c.sheetNetProfit)}.`}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
