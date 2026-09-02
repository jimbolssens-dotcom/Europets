// app/accounting/page.jsx
// Accounting overview: a basic, UAE VAT-aware P&L for one month at a time.
// "Invoiced" numbers (what VAT is due on, per the FTA's supply-date basis)
// sit next to "collected" numbers (actual cash in the door, by payment
// method) since they answer different questions — see the comment in
// app/api/accounting/summary/route.js for the full reasoning. Links out to
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
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  payment_link: 'Payment Link',
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

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString([], {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div>
      <h1>Accounting</h1>
      <p className="visit-meta">
        <a href="/accounting/unpaid">Unpaid Invoices</a> · <a href="/accounting/expenses">Expenses</a>
      </p>

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
              <span className="accounting-stat-label">Revenue Invoiced</span>
              <span className="accounting-stat-value">AED {money(summary.revenue.invoiced)}</span>
              <span className="accounting-stat-hint">Ex-VAT, all non-void invoices dated this month</span>
            </div>
            <div className="accounting-stat">
              <span className="accounting-stat-label">Revenue Collected</span>
              <span className="accounting-stat-value">AED {money(summary.revenue.collected)}</span>
              <span className="accounting-stat-hint">Ex-VAT, invoices actually paid this month</span>
            </div>
            <div className="accounting-stat">
              <span className="accounting-stat-label">Expenses</span>
              <span className="accounting-stat-value">AED {money(summary.expenses.total)}</span>
              <span className="accounting-stat-hint">Ex-VAT · {summary.expenses.count} expense{summary.expenses.count === 1 ? '' : 's'}</span>
            </div>
            <div className="accounting-stat">
              <span className="accounting-stat-label">Net Profit</span>
              <span className="accounting-stat-value">AED {money(summary.net_profit_cash_basis)}</span>
              <span className="accounting-stat-hint">Cash basis: collected minus spent this month</span>
            </div>
          </div>

          <h3>VAT (5%)</h3>
          <div className="accounting-stat-grid">
            <div className="accounting-stat">
              <span className="accounting-stat-label">Output VAT Invoiced</span>
              <span className="accounting-stat-value">AED {money(summary.vat.output_invoiced)}</span>
              <span className="accounting-stat-hint">Due to the FTA for this period</span>
            </div>
            <div className="accounting-stat">
              <span className="accounting-stat-label">Output VAT Collected</span>
              <span className="accounting-stat-value">AED {money(summary.vat.output_collected)}</span>
              <span className="accounting-stat-hint">Actually received from clients this month</span>
            </div>
            <div className="accounting-stat">
              <span className="accounting-stat-label">Input VAT</span>
              <span className="accounting-stat-value">AED {money(summary.vat.input)}</span>
              <span className="accounting-stat-hint">Reclaimable, from expenses this month</span>
            </div>
            <div className="accounting-stat">
              <span className="accounting-stat-label">Net VAT Due</span>
              <span className="accounting-stat-value">AED {money(summary.vat.net_due)}</span>
              <span className="accounting-stat-hint">Output invoiced minus input</span>
            </div>
          </div>

          <h3>Payments Received This Month, By Method</h3>
          <table>
            <thead>
              <tr>
                <th>Method</th>
                <th>Amount (incl. VAT)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(summary.payments_by_method).map(([method, amount]) => (
                <tr key={method}>
                  <td>{PAYMENT_LABELS[method] || method}</td>
                  <td>AED {money(amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="visit-meta">
            <a href="/accounting/unpaid">
              {summary.unpaid.count} unpaid invoice{summary.unpaid.count === 1 ? '' : 's'} outstanding,
              AED {money(summary.unpaid.total)} total
            </a>{' '}
            (not limited to this month)
          </p>
        </>
      )}
    </div>
  );
}
