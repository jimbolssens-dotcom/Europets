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
  invoice_number: '',
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
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [receiptFile, setReceiptFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [possibleDuplicates, setPossibleDuplicates] = useState(null);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [drafts, setDrafts] = useState({}); // `${expenseId}:${field}` -> value while typing, before it's saved on blur

  const loadExpenses = () =>
    fetch(`/api/expenses${showAllMonths ? '' : `?month=${month}`}`)
      .then((res) => res.json())
      .then((data) => {
        setExpenses(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    setLoading(true);
    loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, showAllMonths]);

  useEffect(() => {
    const channel = supabase
      .channel('expenses-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => loadExpenses())
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, showAllMonths]);

  // Any edit to the form invalidates whatever duplicate check ran against
  // the previous values — same pattern as the Clients page's duplicate
  // check (app/(admin)/clients/page.jsx).
  function updateForm(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
    setPossibleDuplicates(null);
  }

  function handleScanned(data) {
    updateForm({
      vendor_name: data.vendor_name || form.vendor_name,
      invoice_number: data.invoice_number || form.invoice_number,
      expense_date: data.expense_date || form.expense_date,
      amount: data.amount !== null && data.amount !== undefined ? String(data.amount) : form.amount,
      vat_amount: data.vat_amount !== null && data.vat_amount !== undefined ? String(data.vat_amount) : form.vat_amount,
      category: data.category || form.category,
    });
    setReceiptFile(data.file || null);
  }

  // Catches a receipt getting scanned (or typed in) twice — same date and
  // same pre-VAT amount is a strong sign it's already logged, since that's
  // exactly what a duplicate scan of the same paper receipt would produce.
  async function findPossibleDuplicateExpenses() {
    if (!form.expense_date || !form.amount) return [];
    const monthKey = form.expense_date.slice(0, 7);
    const res = await fetch(`/api/expenses?month=${monthKey}`);
    const data = await res.json();
    const amountNum = Number(form.amount);

    return (Array.isArray(data) ? data : []).filter(
      (ex) => ex.expense_date === form.expense_date && Math.abs(Number(ex.amount) - amountNum) < 0.01
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!possibleDuplicates) {
      setCheckingDuplicates(true);
      const matches = await findPossibleDuplicateExpenses();
      setCheckingDuplicates(false);
      if (matches.length > 0) {
        setPossibleDuplicates(matches);
        return;
      }
    }

    await createExpense();
  }

  async function createExpense() {
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
    setPossibleDuplicates(null);
    loadExpenses();
    setSubmitting(false);
  }

  function draftKey(expenseId, field) {
    return `${expenseId}:${field}`;
  }

  function draftValue(expense, field, currentValue) {
    const key = draftKey(expense.id, field);
    return key in drafts ? drafts[key] : currentValue;
  }

  function setDraft(expenseId, field, value) {
    setDrafts((prev) => ({ ...prev, [draftKey(expenseId, field)]: value }));
  }

  // Every field on a logged expense edits in place, on blur (or on change
  // for a <select>, which has no "still typing" state to wait out) — no
  // Save button, same pattern as the rest of the app's inline-editable
  // tables. Only PATCHes when the value actually changed.
  function commitField(expense, field, rawValue, { numeric = false } = {}) {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[draftKey(expense.id, field)];
      return next;
    });
    if (numeric && (rawValue === '' || Number.isNaN(Number(rawValue)))) return;
    const value = numeric ? Number(rawValue) : rawValue;
    const current = numeric ? Number(expense[field] || 0) : expense[field] || '';
    if (value === current) return;
    fetch(`/api/expenses/${expense.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    }).then(loadExpenses);
  }

  async function deleteExpense(id) {
    if (!confirm('Delete this expense? This cannot be undone.')) return;
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    loadExpenses();
  }

  const monthTotal = expenses.reduce((sum, ex) => sum + Number(ex.total || 0), 0);

  return (
    <div>
      <div className="page-header">
        <h1>Expenses</h1>
        <a href="/accounting" className="button-link">
          &larr; Accounting
        </a>
      </div>

      <div className="split">
        <div className="split-main">
          <label>
            Month:{' '}
            <input
              type="month"
              value={month}
              disabled={showAllMonths}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>{' '}
          <label>
            <input
              type="checkbox"
              checked={showAllMonths}
              onChange={(e) => setShowAllMonths(e.target.checked)}
            />{' '}
            Show all months
          </label>
          <p className="visit-meta">
            {expenses.length} expense{expenses.length === 1 ? '' : 's'}
            {showAllMonths ? '' : ' this month'}, AED {money(monthTotal)} total (incl. VAT)
          </p>

          {loading ? (
            <p>Loading...</p>
          ) : expenses.length === 0 ? (
            <p>No expenses logged for this month.</p>
          ) : (
            <table className="expenses-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vendor</th>
                  <th>Invoice #</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>VAT</th>
                  <th>Total</th>
                  <th>Paid Via</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((ex) => (
                  <tr key={ex.id}>
                    <td>
                      <input
                        type="date"
                        value={draftValue(ex, 'expense_date', ex.expense_date || '')}
                        onChange={(e) => setDraft(ex.id, 'expense_date', e.target.value)}
                        onBlur={(e) => commitField(ex, 'expense_date', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        placeholder="Vendor"
                        value={draftValue(ex, 'vendor_name', ex.vendor_name || '')}
                        onChange={(e) => setDraft(ex.id, 'vendor_name', e.target.value)}
                        onBlur={(e) => commitField(ex, 'vendor_name', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        placeholder="Invoice #"
                        value={draftValue(ex, 'invoice_number', ex.invoice_number || '')}
                        onChange={(e) => setDraft(ex.id, 'invoice_number', e.target.value)}
                        onBlur={(e) => commitField(ex, 'invoice_number', e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        value={ex.category}
                        onChange={(e) => commitField(ex, 'category', e.target.value)}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {CATEGORY_LABELS[c]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={draftValue(ex, 'amount', ex.amount)}
                        onChange={(e) => setDraft(ex.id, 'amount', e.target.value)}
                        onBlur={(e) => commitField(ex, 'amount', e.target.value, { numeric: true })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={draftValue(ex, 'vat_amount', ex.vat_amount)}
                        onChange={(e) => setDraft(ex.id, 'vat_amount', e.target.value)}
                        onBlur={(e) => commitField(ex, 'vat_amount', e.target.value, { numeric: true })}
                      />
                    </td>
                    <td>AED {money(ex.total)}</td>
                    <td>
                      <select
                        value={ex.payment_method || ''}
                        onChange={(e) => commitField(ex, 'payment_method', e.target.value || null)}
                      >
                        <option value="">Paid via...</option>
                        <option value="cash">Cash</option>
                        <option value="card">Card</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="payment_link">Payment Link</option>
                      </select>
                    </td>
                    <td>
                      <input
                        placeholder="Add a note..."
                        value={draftValue(ex, 'description', ex.description || '')}
                        onChange={(e) => setDraft(ex.id, 'description', e.target.value)}
                        onBlur={(e) => commitField(ex, 'description', e.target.value)}
                      />
                    </td>
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
          <details className="case-files">
            <summary>💰 Log Expense</summary>
            <form className="card" onSubmit={handleSubmit}>
            {error && <p className="error">{error}</p>}

            <ScanReceiptButton onScanned={handleScanned} />
            {receiptFile && <p className="visit-meta">Receipt photo attached: {receiptFile.name}</p>}

            <input
              type="date"
              required
              value={form.expense_date}
              onChange={(e) => updateForm({ expense_date: e.target.value })}
            />
            <input
              placeholder="Vendor"
              value={form.vendor_name}
              onChange={(e) => updateForm({ vendor_name: e.target.value })}
            />
            <input
              placeholder="Invoice / receipt #"
              value={form.invoice_number}
              onChange={(e) => updateForm({ invoice_number: e.target.value })}
            />
            <input
              placeholder="Description"
              value={form.description}
              onChange={(e) => updateForm({ description: e.target.value })}
            />
            <select value={form.category} onChange={(e) => updateForm({ category: e.target.value })}>
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
              onChange={(e) => updateForm({ amount: e.target.value })}
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="VAT amount"
              value={form.vat_amount}
              onChange={(e) => updateForm({ vat_amount: e.target.value })}
            />
            <select
              value={form.payment_method}
              onChange={(e) => updateForm({ payment_method: e.target.value })}
            >
              <option value="">Paid via (optional)...</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="payment_link">Payment Link</option>
            </select>

            {possibleDuplicates?.length > 0 && (
              <div className="possible-duplicate-warning">
                <p>⚠️ This might already be logged — same date and amount:</p>
                <ul>
                  {possibleDuplicates.map((ex) => (
                    <li key={ex.id}>
                      {ex.expense_date} · {ex.vendor_name || 'no vendor'} · AED {money(ex.amount)}
                      {ex.category && ` · ${CATEGORY_LABELS[ex.category] || ex.category}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button type="submit" disabled={submitting || checkingDuplicates || !form.amount}>
              {checkingDuplicates
                ? 'Checking for duplicates...'
                : submitting
                  ? 'Saving...'
                  : possibleDuplicates?.length > 0
                    ? 'Log Anyway'
                    : 'Log Expense'}
            </button>
            </form>
          </details>
        </div>
      </div>
    </div>
  );
}
