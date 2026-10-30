// app/(admin)/accounting/charts/page.jsx
// Accounting charts: takings by method and against the same period a year
// ago, invoiced vs collected, what's owed by age, average invoice, new
// clients, discounts, invoicing by type and by vet, spending by category,
// and the long run from the old system's float sheets (every month since
// Mar 2023, year on year, net profit, payment mix, weekdays, costs). Figures
// from app/api/accounting/charts (lib/accountingCharts.js). Charts are plain
// SVG drawn at the width they're given, so text stays readable on a phone;
// every bar has its exact figure on hover (or tap).

'use client';

import { useEffect, useState } from 'react';
import { short, aed, useWidth, niceMax, HBars, Legend, Card } from '../chartParts';
import { YEAR_COLORS, MONTH_NAMES, METHODS, monthLabel, pct, change, LineChart, SignedBars, ShareBars, Kpi } from './historyParts';
import { yearAgoTakings } from '@/lib/floatHistory';

const SERIES = {
  card: { label: 'Card', color: 'var(--chart-1)' },
  cash: { label: 'Cash', color: 'var(--chart-2)' },
  online: { label: 'Payment link / online', color: 'var(--chart-3)' },
  bank_transfer: { label: 'Bank transfer', color: 'var(--chart-4)' },
  other: { label: 'Other', color: 'var(--chart-5)' },
  old_system: { label: 'Old system balances', color: 'var(--chart-neutral)' },
};
// Food as a share of all line items in the range, e.g. "7%".
function foodShare(data) {
  const all = data.byType.reduce((t, r) => t + r.value, 0);
  const food = data.byType.find((r) => r.label === 'food')?.value || 0;
  return all ? `${Math.round((food / all) * 100)}%` : '0%';
}

const TYPE_LABELS = { service: 'Services', product: 'Products', food: 'Food', test: 'Tests', other: 'Other' };
const SPEND_LABELS = {
  salaries: 'Salaries', rent: 'Rent', supplies: 'Supplies', utilities: 'Utilities', equipment: 'Equipment',
  marketing: 'Marketing', professional_fees: 'Professional fees', other: 'Other',
};

function bucketLabel(key, unit) {
  const d = new Date(`${key}T00:00:00Z`);
  if (unit === 'month') return d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// Vertical bars per bucket: stacked series, or grouped side by side.
function BarChart({ buckets, unit, series, stacked = false, height = 220, format = short, total = true, tooltipFormat = aed }) {
  const [ref, width] = useWidth();
  const L = 38, B = height - 22, T = 18;
  const totals = buckets.map((b) => (stacked ? series.reduce((t, s) => t + (s.values[b] || 0), 0) : Math.max(...series.map((s) => s.values[b] || 0))));
  const max = niceMax(Math.max(...totals, 0));
  const y = (v) => B - (v / max) * (B - T);
  const step = width > L ? (width - L) / buckets.length : 0;
  const groupW = Math.min(64, step * 0.7);
  // Show every label that fits (about 46px each), every other one if not.
  const every = step > 0 ? Math.max(1, Math.ceil(46 / step)) : 1;
  return (
    <div ref={ref} className="acct-chart">
      {width > 0 && (
        <svg width={width} height={height} role="img">
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={L} x2={width} y1={y(max * f)} y2={y(max * f)} className="acct-chart-gridline" />
              <text x={L - 5} y={y(max * f) + 4} textAnchor="end">{short(max * f)}</text>
            </g>
          ))}
          {buckets.map((b, i) => {
            const x0 = L + i * step + (step - groupW) / 2;
            let acc = 0;
            const barW = stacked ? groupW : (groupW - 2 * (series.length - 1)) / series.length;
            const parts = series.filter((s) => (s.values[b] || 0) > 0);
            return (
              <g key={b}>
                {series.map((s, j) => {
                  const v = s.values[b] || 0;
                  if (v <= 0) return null;
                  const h = (v / max) * (B - T);
                  const top = stacked ? y(acc + v) : y(v);
                  const x = stacked ? x0 : x0 + j * (barW + 2);
                  const isTop = !stacked || parts[parts.length - 1] === s;
                  acc += stacked ? v : 0;
                  const r = isTop ? Math.min(4, barW / 2, h) : 0;
                  const gap = stacked && !isTop ? 2 : 0;
                  return (
                    <path
                      key={s.key}
                      d={`M${x},${top + h - (stacked ? 0 : 0)}V${top + r + gap}q0,${-r} ${r},${-r}h${barW - 2 * r}q${r},0 ${r},${r}V${top + h}z`}
                      fill={s.color}
                    >
                      <title>{`${bucketLabel(b, unit)} · ${s.label}: ${tooltipFormat(v, b)}`}</title>
                    </path>
                  );
                })}
                {total && totals[i] > 0 && (
                  <text x={x0 + groupW / 2} y={y(totals[i]) - 5} textAnchor="middle" className="acct-chart-value">{format(totals[i])}</text>
                )}
                {(buckets.length - 1 - i) % every === 0 && (
                  <text x={x0 + groupW / 2} y={B + 15} textAnchor="middle">{bucketLabel(b, unit)}</text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export default function AccountingChartsPage() {
  const [range, setRange] = useState('weeks');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  // The long run (old float sheets + the app, app/api/accounting/history),
  // loaded once whatever range is picked.
  const [hist, setHist] = useState(null);
  const [histError, setHistError] = useState(null);

  useEffect(() => {
    fetch('/api/accounting/history')
      .then((r) => r.json())
      .then((d) => (d.error ? setHistError(d.error) : setHist(d)))
      .catch((e) => setHistError(e.message));
  }, []);

  useEffect(() => {
    setData(null);
    fetch(`/api/accounting/charts?range=${range}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch((e) => setError(e.message));
  }, [range]);

  const unit = data?.unit;
  const takingsSeries = data
    ? Object.keys(SERIES)
        .filter((k) => Object.values(data.takings[k]).some((v) => v > 0))
        .map((k) => ({ key: k, ...SERIES[k], values: data.takings[k] }))
    : [];

  // The same weeks or months a year earlier, from the float's days.
  const yearAgo = data && hist ? yearAgoTakings({ buckets: data.buckets, unit, days: hist.days, months: hist.months }) : {};
  const comparable = data ? data.buckets.filter((b) => yearAgo[b] != null) : [];
  const rangeTotal = comparable.reduce((t, b) => t + (data.takingsTotal[b] || 0), 0);
  const yearAgoTotal = comparable.reduce((t, b) => t + (yearAgo[b] || 0), 0);
  const histMonths = hist?.months || [];
  const histLabels = histMonths.map((m) => monthLabel(m.month));
  const methodMonths = histMonths.filter((m) => m.hasMethods && m.takings > 0);

  return (
    <div className="acct-charts">
      <div className="page-header">
        <h1>📈 Charts</h1>
        <div className="page-header-actions">
          <a href="/accounting" className="button-link">← Accounting</a>
        </div>
      </div>
      {hist && (
        <div className="acct-history-kpis">
          {hist.monthToDate?.rows?.[0] && (
            <Kpi
              label={`${monthLabel(hist.monthToDate.month, false)} 1 to ${hist.monthToDate.throughDay}`}
              value={aed(hist.monthToDate.rows[0].total)}
              note={
                hist.monthToDate.rows
                  .slice(1)
                  .map((r) => `${r.year}: ${short(r.total)} (${change(pct(hist.monthToDate.rows[0].total, r.total))})`)
                  .join(' · ') || 'No earlier year to compare'
              }
            />
          )}
          {hist.trailing && (
            <Kpi
              label={`${monthLabel(hist.trailing.from)} to ${monthLabel(hist.trailing.to)}`}
              value={aed(hist.trailing.takings)}
              note={`Year before: ${short(hist.trailing.priorTakings)} (${change(pct(hist.trailing.takings, hist.trailing.priorTakings))})`}
            />
          )}
        </div>
      )}
      {histError && <p className="error">Older figures: {histError}</p>}
      <div className="acct-chart-range" role="tablist">
        {[['weeks', 'Last 8 weeks'], ['months', 'Last 12 months']].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={range === key} className={range === key ? 'on' : ''} onClick={() => setRange(key)}>
            {label}
          </button>
        ))}
        <span className="visit-meta">{range === 'weeks' ? 'By week, Monday to Sunday' : 'By month'}; this {unit === 'month' ? 'month' : 'week'} so far</span>
      </div>

      {error && <p className="error">{error}</p>}
      {!data && !error && <p>Loading...</p>}
      {data && (
        <div className="acct-chart-grid">
          <Card
            wide
            title="Takings, by payment method"
            why={`Everything received, including payments on old-system balances.${data.oldFloatBuckets.length ? " Before Oct 26, from the old system's float sheets." : ''}`}
          >
            <Legend items={takingsSeries} />
            <BarChart buckets={data.buckets} unit={unit} series={takingsSeries} stacked />
          </Card>

          {hist && (
            <Card
              wide
              title="This period vs a year ago"
              why={unit === 'month' ? 'Takings each month beside the same month last year.' : 'Takings each week beside the same week last year (Monday to Sunday, 52 weeks back).'}
            >
              <Legend items={[{ label: 'A year ago', color: 'var(--chart-neutral)' }, { label: 'This year', color: 'var(--chart-1)' }]} />
              <BarChart
                buckets={data.buckets}
                unit={unit}
                total={false}
                series={[
                  { key: 'ago', label: 'A year ago', color: 'var(--chart-neutral)', values: yearAgo },
                  { key: 'now', label: 'This year', color: 'var(--chart-1)', values: data.takingsTotal },
                ]}
              />
              {yearAgoTotal > 0 && (
                <p className="visit-meta">
                  This range: {aed(rangeTotal)} against {aed(yearAgoTotal)} a year ago ({change(pct(rangeTotal, yearAgoTotal))})
                </p>
              )}
            </Card>
          )}

          <Card title="Invoiced vs collected" why="When invoiced runs ahead of collected, unpaid balances are building up (collected: new invoices only).">
            <Legend items={[{ label: 'Invoiced', color: 'var(--chart-neutral)' }, { label: 'Collected', color: 'var(--chart-1)' }]} />
            <BarChart
              buckets={data.buckets}
              unit={unit}
              total={false}
              series={[
                { key: 'inv', label: 'Invoiced', color: 'var(--chart-neutral)', values: data.invoiced },
                { key: 'col', label: 'Collected', color: 'var(--chart-1)', values: data.collected },
              ]}
            />
          </Card>

          <Card title="What's owed, by how long" why="Every unpaid invoice today, by its age. The darker, the longer it has waited.">
            <HBars rows={data.owed.map((o, i) => ({ label: o.label, value: o.value, note: `(${o.count})`, color: `var(--chart-age-${Math.min(i, 3)})` }))} />
            <p className="visit-meta"><a href="/accounting/unpaid">Unpaid invoices →</a></p>
          </Card>

          <Card title="Average invoice" why="Invoiced total divided by the number of invoices.">
            <BarChart
              buckets={data.buckets}
              unit={unit}
              series={[{ key: 'avg', label: 'Average invoice', color: 'var(--chart-1)', values: data.averageInvoice }]}
              height={190}
            />
          </Card>

          <Card title="New clients" why="Clients added in the app (registered at the desk or through the new-client form); old-system imports aren't counted.">
            <BarChart
              buckets={data.buckets}
              unit={unit}
              format={(v) => String(Math.round(v))}
              tooltipFormat={(v) => `${v} new client${v === 1 ? '' : 's'}`}
              series={[{ key: 'new', label: 'New clients', color: 'var(--chart-3)', values: data.newClients }]}
              height={190}
            />
          </Card>

          <Card title="Client app" why="People who asked for a login code to install the app (counted once, in the period of their first request), and how many of them logged in.">
            <Legend items={[{ label: 'Asked for a code', color: 'var(--chart-neutral)' }, { label: 'Logged in', color: 'var(--chart-3)' }]} />
            <BarChart
              buckets={data.buckets}
              unit={unit}
              total={false}
              format={(v) => String(Math.round(v))}
              tooltipFormat={(v) => `${v} ${v === 1 ? 'person' : 'people'}`}
              series={[
                { key: 'asked', label: 'Asked for a code', color: 'var(--chart-neutral)', values: data.app.asked },
                { key: 'in', label: 'Logged in', color: 'var(--chart-3)', values: data.app.loggedIn },
              ]}
              height={190}
            />
            <p className="visit-meta">
              Since it started: {data.app.totals.asked} asked, {data.app.totals.loggedIn} logged in, {data.app.totals.usedEver} clients have used the app ({data.app.totals.used30} in the last 30 days)
            </p>
          </Card>

          <Card title="Discounts given" why="What came off bills in each period (VAT included), on the day it was given, supporter bonuses included (hover for how many invoices).">
            <BarChart
              buckets={data.buckets}
              unit={unit}
              series={[{ key: 'disc', label: 'Discounts', color: 'var(--chart-2)', values: data.discounts }]}
              tooltipFormat={(v, b) => `${aed(v)} on ${data.discountCount[b]} invoice${data.discountCount[b] === 1 ? '' : 's'}`}
              height={190}
            />
            <p className="visit-meta">
              {Object.values(data.discountCount).reduce((t, v) => t + v, 0)} discounted invoice(s) in this range, {aed(Object.values(data.discounts).reduce((t, v) => t + v, 0))} in total
            </p>
          </Card>

          <Card title="Invoicing by type" why="Services (consults, surgery, hospital stays), food, other products (medication, toys) and tests, before VAT and discounts.">
            <HBars rows={data.byType.map((r) => ({ ...r, label: TYPE_LABELS[r.label] || r.label }))} />
          </Card>

          <Card title="Food sales" why="Invoicing from the catalog's Food items in each period, before VAT and discounts.">
            <BarChart
              buckets={data.buckets}
              unit={unit}
              series={[{ key: 'food', label: 'Food', color: 'var(--chart-4)', values: data.food }]}
              height={190}
            />
            <p className="visit-meta">
              {aed(Object.values(data.food).reduce((t, v) => t + v, 0))} in this range, {foodShare(data)} of all invoicing
            </p>
          </Card>

          <Card title="Invoicing by vet" why="Invoices from each vet's consults. No vet: hospital stays and sales not tied to a consult.">
            <HBars rows={data.byVet.map((r) => ({ ...r, color: r.label === 'No vet' ? 'var(--chart-neutral)' : 'var(--chart-1)' }))} />
          </Card>

          <Card title="Spending by category" why="Expenses dated in this range.">
            <HBars rows={data.spending.map((r) => ({ ...r, label: SPEND_LABELS[r.label] || r.label }))} color="var(--chart-2)" />
          </Card>

          {hist && (
            <>
              <Card wide title="Every month: takings and outgoing" why="Since Mar 23: the old system's float sheets, then the app from Oct 26. Outgoing is everything paid out, salaries and the other fixed costs included.">
                <Legend items={[{ label: 'Takings', color: 'var(--chart-1)' }, { label: 'Outgoing', color: 'var(--chart-2)' }]} />
                <LineChart
                  labels={histLabels}
                  lines={[
                    { key: 't', label: 'Takings', color: 'var(--chart-1)', values: histMonths.map((m) => m.takings || null), bold: true },
                    { key: 'o', label: 'Outgoing', color: 'var(--chart-2)', values: histMonths.map((m) => m.outgoing || null) },
                  ]}
                />
              </Card>

              <Card wide title="Takings, year on year" why="Everything taken each month, a line per year. Tap a dot for the figure.">
                <Legend items={hist.yearOnYear.years.map((y, i) => ({ label: y, color: YEAR_COLORS[Math.max(0, YEAR_COLORS.length - hist.yearOnYear.years.length + i)] }))} />
                <LineChart
                  labels={MONTH_NAMES}
                  every={1}
                  lines={hist.yearOnYear.years.map((y, i) => ({
                    key: y,
                    label: y,
                    color: YEAR_COLORS[Math.max(0, YEAR_COLORS.length - hist.yearOnYear.years.length + i)],
                    values: hist.yearOnYear.values[y],
                    bold: i === hist.yearOnYear.years.length - 1,
                  }))}
                />
              </Card>

              <Card wide title="Net profit, by month" why="From the old float: takings less outgoing (Dr Jim's salary included) and the fixed costs. Red is a loss.">
                <SignedBars
                  labels={histLabels}
                  values={histMonths.map((m) => m.netProfit)}
                  titles={histMonths.map((m) => (m.netProfit == null ? '' : `${monthLabel(m.month)}: ${aed(m.netProfit)} (fixed costs ${aed(m.fixedCosts)})${m.oneOff ? `, before the one-off ${aed(m.oneOff)}` : ''}`))}
                />
                {histMonths.filter((m) => m.oneOff).map((m) => (
                  <p key={m.month} className="visit-meta">
                    {monthLabel(m.month)} leaves out a one-off {aed(m.oneOff)}: {m.oneOffNote}.
                  </p>
                ))}
              </Card>

              <Card title="How clients pay, over time" why="Each month's takings by method, as a share. PayPal/transfer in the float and the app's payment links and transfers count as online.">
                <Legend items={METHODS} />
                <ShareBars labels={methodMonths.map((m) => monthLabel(m.month))} rows={methodMonths} />
              </Card>

              <Card title="Busiest days of the week" why="Average takings on each day of the week, over every day the clinic took something since Jan 25.">
                <HBars rows={hist.weekdays.map((d) => ({ label: d.label, value: d.value }))} />
              </Card>

              <Card wide title="Where the money went" why={`Average per month from the old float, over the ${hist.costs.months} months with its full cost side (Jan 25 to Aug 26).`}>
                <HBars rows={hist.costs.rows} color="var(--chart-2)" />
              </Card>

              {hist.corrections.length > 0 && (
                <Card wide title="Where the old float's own totals were off" why="These months are added up from the float's daily rows; the sheet's own totals said otherwise.">
                  <ul className="acct-history-notes">
                    {hist.corrections.map((c) => (
                      <li key={c.month}>
                        <strong>{monthLabel(c.month)}</strong>
                        {c.sheetTakings != null && Math.abs(c.sheetTakings - c.takings) > 1 && ` takings ${aed(c.takings)}, the sheet says ${aed(c.sheetTakings)}.`}
                        {c.sheetNetProfit != null && c.netProfit != null && Math.abs(c.sheetNetProfit - c.netProfit) > 1 && ` Net profit ${aed(c.netProfit)}, the sheet says ${aed(c.sheetNetProfit)}.`}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
