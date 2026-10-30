// app/accounting/page.jsx
// Accounting overview: one month's books in the clinic's own layout (the
// old Float spreadsheet): total takings, total outgoing, gross profit,
// fixed monthly costs, net profit, then VAT takings / collected / paid /
// net due. See lib/accountingSummary.js for how each is worked out. Links out to
// the Unpaid Invoices (for chasing reminders) and Expenses (incl. receipt
// photo scanning) pages, which are the two things this page can't show
// inline without getting cluttered.

'use client';

import { useEffect, useState } from 'react';

function money(n) {
  return Number(n || 0).toFixed(2);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

const PAYMENT_LABELS = {
  cash: 'Cash',
  card: 'Card / Visa',
  online: 'Online (payment links, Nomod, PayPal...)',
  bank_transfer: 'Bank Transfer',
  other: 'Other / method not recorded',
};

export default function AccountingOverviewPage() {
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/accounting/summary?month=${month}`)
      .then((res) => res.json())
      .then((data) => {
        setSummary(data);
        setLoading(false);
      });
  }, [month]);

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', {
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <div>
      <div className="page-header">
        <h1>Accounting</h1>
        <div className="page-header-actions accounting-links">
          <a href="/accounting/charts" className="button-link">
            📈 Charts
          </a>
          <a href="/accounting/history" className="button-link">
            📜 History
          </a>
          <a href="/shift-tally" className="button-link">
            💰 Shift Tally
          </a>
          <a href="/accounting/unpaid" className="button-link">
            ⚠️ Unpaid Invoices
          </a>
          <a href="/accounting/expenses" className="button-link">
            🧾 Expenses
          </a>
          <a href="/accounting/staff-expenses" className="button-link">
            👤 Staff Expenses
          </a>
          <a href="/accounting/donations" className="button-link">
            💳 Online Payments
          </a>
          <a href="/accounting/website" className="button-link">
            🌐 Website &amp; Domains
          </a>
          <a href="/accounting/legacy-payments" className="button-link">
            📇 Old System Payments
          </a>
          <a href="/accounting/database-backup" className="button-link">
            🗄️ Database Backup
          </a>
        </div>
      </div>

      <label>
        Month:{' '}
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </label>

      {loading || !summary ? (
        <p>Loading...</p>
      ) : (
        <>
          <h2>{monthLabel}</h2>

          <div className="accounting-stat-grid">
            <div className="accounting-stat">
              <span className="accounting-stat-label">Total Takings</span>
              <span className="accounting-stat-value">AED {money(summary.takings.total)}</span>
              <span className="accounting-stat-hint">
                Everything received, incl. AED {money(summary.takings.old_system)} on{' '}
                <a href="/accounting/legacy-payments">old system balances</a> ({summary.takings.old_system_count})
              </span>
            </div>
            <div className="accounting-stat">
              <span className="accounting-stat-label">Total Outgoing</span>
              <span className="accounting-stat-value">AED {money(summary.outgoing.total)}</span>
              <span className="accounting-stat-hint">
                With VAT · AED {money(summary.outgoing.ex_vat)} without · {summary.outgoing.count} expense
                {summary.outgoing.count === 1 ? '' : 's'}
              </span>
            </div>
            <div className="accounting-stat">
              <span className="accounting-stat-label">Gross Profit</span>
              <span className="accounting-stat-value">AED {money(summary.gross_profit.total)}</span>
              <span className="accounting-stat-hint">Takings less outgoing · ex-VAT AED {money(summary.gross_profit.ex_vat)}</span>
            </div>
            <div className="accounting-stat">
              <span className="accounting-stat-label">Fixed Monthly Costs</span>
              <span className="accounting-stat-value">AED {money(summary.fixed_costs.total)}</span>
              <span className="accounting-stat-hint">
                Salaries, sponsor, rent, utilities... ({summary.fixed_costs.count}) · <a href="/accounting/expenses">tick on any expense</a>
              </span>
            </div>
            <div className="accounting-stat">
              <span className="accounting-stat-label">Net Profit</span>
              <span className="accounting-stat-value">AED {money(summary.net_profit.total)}</span>
              <span className="accounting-stat-hint">Gross profit less fixed costs · ex-VAT AED {money(summary.net_profit.ex_vat)}</span>
            </div>
          </div>

          {/* Invoice-date figures: what was billed this month and what's
              still owed. A tile until the 16 Oct relayout moved it to a
              grey line at the bottom; back as tiles. */}
          <h3>Invoiced &amp; Outstanding</h3>
          <div className="accounting-stat-grid">
            <div className="accounting-stat">
              <span className="accounting-stat-label">Invoiced This Month</span>
              <span className="accounting-stat-value">AED {money(summary.invoiced.total)}</span>
              <span className="accounting-stat-hint">
                With VAT · AED {money(summary.invoiced.revenue_ex_vat)} ex-VAT · {summary.invoiced.count} invoice
                {summary.invoiced.count === 1 ? '' : 's'} · discounts AED {money(summary.discounts.total)}
              </span>
            </div>
            <div className="accounting-stat">
              <span className="accounting-stat-label">Outstanding This Month</span>
              <span className="accounting-stat-value">AED {money(summary.invoiced.outstanding)}</span>
              <span className="accounting-stat-hint">
                Still unpaid on {summary.invoiced.outstanding_count} of this month&apos;s {summary.invoiced.count} invoice
                {summary.invoiced.count === 1 ? '' : 's'}
              </span>
            </div>
            <div className="accounting-stat">
              <span className="accounting-stat-label">Outstanding In Total</span>
              <span className="accounting-stat-value">AED {money(summary.unpaid.total)}</span>
              <span className="accounting-stat-hint">
                <a href="/accounting/unpaid">
                  {summary.unpaid.count} unpaid invoice{summary.unpaid.count === 1 ? '' : 's'}
                </a>
                , any month
              </span>
            </div>
          </div>

          <h3>Takings by Method</h3>
          <table>
            <thead>
              <tr>
                <th>Method</th>
                <th>Amount (incl. VAT)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(summary.takings.by_method)
                .filter(([method, amount]) => method !== 'other' || Number(amount) > 0)
                .map(([method, amount]) => (
                  <tr key={method}>
                    <td>{PAYMENT_LABELS[method] || method}</td>
                    <td>AED {money(amount)}</td>
                  </tr>
                ))}
            </tbody>
          </table>

          <h3>VAT (5%)</h3>
          <div className="accounting-stat-grid">
            <div className="accounting-stat">
              <span className="accounting-stat-label">VAT Takings</span>
              <span className="accounting-stat-value">AED {money(summary.vat.takings)}</span>
              <span className="accounting-stat-hint">Amount VAT applies to: VAT collected ÷ 5%</span>
            </div>
            <div className="accounting-stat">
              <span className="accounting-stat-label">VAT Collected</span>
              <span className="accounting-stat-value">AED {money(summary.vat.collected)}</span>
              <span className="accounting-stat-hint">
                Paid by clients: new invoices AED {money(summary.vat.collected_new_invoices)} · old system AED{' '}
                {money(summary.vat.collected_old_system)}
              </span>
            </div>
            <div className="accounting-stat">
              <span className="accounting-stat-label">VAT Paid</span>
              <span className="accounting-stat-value">AED {money(summary.vat.paid)}</span>
              <span className="accounting-stat-hint">On expenses this month</span>
            </div>
            <div className="accounting-stat">
              <span className="accounting-stat-label">Net VAT Due</span>
              <span className="accounting-stat-value">AED {money(summary.vat.net_due)}</span>
              <span className="accounting-stat-hint">VAT collected less VAT paid</span>
            </div>
          </div>

        </>
      )}
    </div>
  );
}
