// app/accounting/expenses/page.jsx
// Expense list + add form. Two ways to add one: fill the form by hand, or
// scan/upload a photo of the receipt (ScanReceiptButton reads it via
// Claude vision and pre-fills vendor/date/amount/VAT/category) — the
// photo itself is then saved as a regular attachment against the new
// expense once it's created, same pattern as every other photo in the
// app (see lib/attachments.js).

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { uploadAttachment } from '@/lib/attachments';
import ScanReceiptButton from '@/app/_components/ScanReceiptButton';

function money(n) {
  return Number(n || 0).toFixed(2);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

const CATEGORIES = [
  'supplies',
  'rent',
  'utilities',
  'salaries',
  'equipment',
  'marketing',
  'professional_fees',
  'other',
];
const CATEGORY_LABELS = {
  supplies: 'Supplies',
  rent: 'Rent',
  utilities: 'Utilities',
  salaries: 'Salaries',
  equipment: 'Equipment',
  marketing: 'Marketing',
  professional_fees: 'Professional Fees',
  other: 'Other',
};

const emptyForm = {
  expense_date: today(),
  vendor_name: '',
  description: '',
  category: 'other',
  amount: '',
  vat_amount: '',
  payment_method: '',
};

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(currentMonth());
  const [form, setForm] = useState(emptyForm);
  const [receiptFile, setReceiptFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const loadExpenses = () =>
    fetch(`/api/expenses?month=${month}`)
      .then((res) => res.json())
      .then((data) => {
        setExpenses(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    setLoading(true);
    loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    const channel = supabase
      .channel('expenses-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => loadExpenses())
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  function handleScanned(data) {
    setForm((prev) => ({
      ...prev,
      vendor_name: data.vendor_name || prev.vendor_name,
      expense_date: data.expense_date || prev.expense_date,
      amount: data.amount !== null && data.amount !== undefined ? String(data.amount) : prev.amount,
      vat_amount: data.vat_amount !== null && data.vat_amount !== undefined ? String(data.vat_amount) : prev.vat_amount,
      category: data.category || prev.category,
    }));
    setReceiptFile(data.file || null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        amount: Number(form.amount),
        vat_amount: form.vat_amount ? Number(form.vat_amount) : 0,
        payment_method: form.payment_method || null,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Failed to save expense');
      setSubmitting(false);
      return;
    }

    if (receiptFile) {
      try {
        await uploadAttachment({ entityType: 'expense', entityId: data.id, file: receiptFile });
      } catch (err) {
        setError(`Expense saved, but the receipt photo failed to attach: ${err.message}`);
      }
    }

    setForm(emptyForm);
    setReceiptFile(null);
    loadExpenses();
    setSubmitting(false);
  }

  async function deleteExpense(id) {
    if (!confirm('Delete this expense? This cannot be undone.')) return;
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    loadExpenses();
  }

  const monthTotal = expenses.reduce((sum, ex) => sum + Number(ex.total || 0), 0);

  return (
    <div>
      <p>
        <a href="/accounting">&larr; Accounting</a>
      </p>
      <h1>Expenses</h1>

      <div className="split">
        <div className="split-main">
          <label>
            Month:{' '}
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <p className="visit-meta">
            {expenses.length} expense{expenses.length === 1 ? '' : 's'}, AED {money(monthTotal)} total (incl. VAT)
          </p>

          {loading ? (
            <p>Loading...</p>
          ) : expenses.length === 0 ? (
            <p>No expenses logged for this month.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vendor</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>VAT</th>
                  <th>Total</th>
                  <th>Paid Via</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((ex) => (
                  <tr key={ex.id}>
                    <td>{ex.expense_date}</td>
                    <td>{ex.vendor_name || '—'}</td>
                    <td>{CATEGORY_LABELS[ex.category] || ex.category}</td>
                    <td>AED {money(ex.amount)}</td>
                    <td>AED {money(ex.vat_amount)}</td>
                    <td>AED {money(ex.total)}</td>
                    <td>{ex.payment_method ? ex.payment_method.replace('_', ' ') : '—'}</td>
                    <td>
                      <button type="button" onClick={() => deleteExpense(ex.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="split-aside">
          <form className="card" onSubmit={handleSubmit}>
            <h2>Log Expense</h2>
            {error && <p className="error">{error}</p>}

            <ScanReceiptButton onScanned={handleScanned} />
            {receiptFile && <p className="visit-meta">Receipt photo attached: {receiptFile.name}</p>}

            <input
              type="date"
              required
              value={form.expense_date}
              onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
            />
            <input
              placeholder="Vendor"
              value={form.vendor_name}
              onChange={(e) => setForm({ ...form, vendor_name: e.target.value })}
            />
            <input
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="Amount (pre-VAT)"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="VAT amount"
              value={form.vat_amount}
              onChange={(e) => setForm({ ...form, vat_amount: e.target.value })}
            />
            <select
              value={form.payment_method}
              onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
            >
              <option value="">Paid via (optional)...</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="payment_link">Payment Link</option>
            </select>
            <button type="submit" disabled={submitting || !form.amount}>
              {submitting ? 'Saving...' : 'Log Expense'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
