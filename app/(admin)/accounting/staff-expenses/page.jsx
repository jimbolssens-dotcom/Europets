// app/accounting/staff-expenses/page.jsx
// Every staff member, one place to log what's spent on them — a salary
// payment, a reimbursement, anything else attributed to that person —
// and see what's already logged. Reuses the same `expenses` table as the
// main Expenses page (see migration 110's staff_id column); this is just
// a staff-first view onto it rather than a separate ledger. Deeper edits
// (fixing a typo, changing the date) still happen on the Expenses page
// itself, which shows the same rows with a "Staff" column.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

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
  'salaries',
  'supplies',
  'rent',
  'utilities',
  'equipment',
  'marketing',
  'professional_fees',
  'other',
];
const CATEGORY_LABELS = {
  salaries: 'Salary',
  supplies: 'Supplies',
  rent: 'Rent',
  utilities: 'Utilities',
  equipment: 'Equipment',
  marketing: 'Marketing',
  professional_fees: 'Professional Fees',
  other: 'Other',
};

const ROLE_ORDER = ['vet', 'tech', 'reception', 'cleaner', 'driver', 'admin'];

const emptySalaryForm = { expense_date: today(), amount: '', payment_method: '' };
const emptyExpenseForm = {
  expense_date: today(),
  category: 'other',
  description: '',
  amount: '',
  vat_amount: '',
  payment_method: '',
};

export default function StaffExpensesPage() {
  const [staffList, setStaffList] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(currentMonth());
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [salaryForms, setSalaryForms] = useState({}); // staff id -> emptySalaryForm-shaped draft
  const [expenseForms, setExpenseForms] = useState({}); // staff id -> emptyExpenseForm-shaped draft
  const [showExpenseForm, setShowExpenseForm] = useState({}); // staff id -> bool
  const [submitting, setSubmitting] = useState(null); // staff id currently saving, or null
  const [errors, setErrors] = useState({}); // staff id -> error message

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
    fetch('/api/staff')
      .then((res) => res.json())
      .then((data) => setStaffList(Array.isArray(data) ? data : []));

    const channel = supabase
      .channel('staff-expenses-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => loadExpenses())
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedStaff = [...staffList].sort((a, b) => {
    const roleRank = (role) => {
      const i = ROLE_ORDER.indexOf(role);
      return i === -1 ? ROLE_ORDER.length : i;
    };
    const roleDiff = roleRank(a.role) - roleRank(b.role);
    return roleDiff !== 0 ? roleDiff : a.full_name.localeCompare(b.full_name);
  });

  function expensesFor(staffId) {
    return expenses.filter((ex) => ex.staff_id === staffId);
  }

  function totalFor(staffId) {
    return expensesFor(staffId).reduce((sum, ex) => sum + Number(ex.total || 0), 0);
  }

  const overallTotal = expenses.filter((ex) => ex.staff_id).reduce((sum, ex) => sum + Number(ex.total || 0), 0);

  function salaryForm(staffId) {
    return salaryForms[staffId] || emptySalaryForm;
  }

  function updateSalaryForm(staffId, patch) {
    setSalaryForms((prev) => ({ ...prev, [staffId]: { ...salaryForm(staffId), ...patch } }));
  }

  function expenseForm(staffId) {
    return expenseForms[staffId] || emptyExpenseForm;
  }

  function updateExpenseForm(staffId, patch) {
    setExpenseForms((prev) => ({ ...prev, [staffId]: { ...expenseForm(staffId), ...patch } }));
  }

  async function logSalary(staff) {
    const form = salaryForm(staff.id);
    if (!form.amount) return;
    setSubmitting(staff.id);
    setErrors((prev) => ({ ...prev, [staff.id]: null }));

    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expense_date: form.expense_date,
        category: 'salaries',
        description: `Salary — ${staff.full_name}`,
        amount: Number(form.amount),
        vat_amount: 0,
        payment_method: form.payment_method || null,
        staff_id: staff.id,
      }),
    });
    const data = await res.json();
    setSubmitting(null);

    if (!res.ok) {
      setErrors((prev) => ({ ...prev, [staff.id]: data.error || 'Failed to log salary' }));
      return;
    }
    setSalaryForms((prev) => ({ ...prev, [staff.id]: emptySalaryForm }));
    loadExpenses();
  }

  async function logExpense(staff) {
    const form = expenseForm(staff.id);
    if (!form.amount) return;
    setSubmitting(staff.id);
    setErrors((prev) => ({ ...prev, [staff.id]: null }));

    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expense_date: form.expense_date,
        category: form.category,
        description: form.description || null,
        amount: Number(form.amount),
        vat_amount: form.vat_amount ? Number(form.vat_amount) : 0,
        payment_method: form.payment_method || null,
        staff_id: staff.id,
      }),
    });
    const data = await res.json();
    setSubmitting(null);

    if (!res.ok) {
      setErrors((prev) => ({ ...prev, [staff.id]: data.error || 'Failed to log expense' }));
      return;
    }
    setExpenseForms((prev) => ({ ...prev, [staff.id]: emptyExpenseForm }));
    setShowExpenseForm((prev) => ({ ...prev, [staff.id]: false }));
    loadExpenses();
  }

  async function deleteExpense(id) {
    if (!confirm('Delete this expense? This cannot be undone.')) return;
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    loadExpenses();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Staff Expenses</h1>
        <a href="/accounting" className="button-link">
          &larr; Accounting
        </a>
      </div>

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
        AED {money(overallTotal)} logged against staff{showAllMonths ? '' : ' this month'}
      </p>

      {loading ? (
        <p>Loading...</p>
      ) : sortedStaff.length === 0 ? (
        <p>
          No staff yet — add some on the <a href="/staff">Staff</a> page first.
        </p>
      ) : (
        sortedStaff.map((staff) => {
          const staffExpenses = expensesFor(staff.id);
          const sForm = salaryForm(staff.id);
          const eForm = expenseForm(staff.id);
          const busy = submitting === staff.id;

          return (
            <div key={staff.id} className={`card staff-expense-card${staff.active === false ? ' staff-expense-card-inactive' : ''}`}>
              <h2>
                {staff.full_name} <span className="visit-meta">({staff.role}{staff.active === false ? ', inactive' : ''})</span>
              </h2>
              <p className="visit-meta">
                AED {money(totalFor(staff.id))} logged{showAllMonths ? '' : ' this month'}
                {staffExpenses.length > 0 ? ` · ${staffExpenses.length} entr${staffExpenses.length === 1 ? 'y' : 'ies'}` : ''}
              </p>

              {errors[staff.id] && <p className="error">{errors[staff.id]}</p>}

              <div className="staff-expense-quick-forms">
                <div className="staff-expense-quick-form">
                  <input
                    type="date"
                    value={sForm.expense_date}
                    onChange={(e) => updateSalaryForm(staff.id, { expense_date: e.target.value })}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Salary amount"
                    value={sForm.amount}
                    onChange={(e) => updateSalaryForm(staff.id, { amount: e.target.value })}
                  />
                  <select
                    value={sForm.payment_method}
                    onChange={(e) => updateSalaryForm(staff.id, { payment_method: e.target.value })}
                  >
                    <option value="">Paid via...</option>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="payment_link">Payment Link</option>
                  </select>
                  <button type="button" onClick={() => logSalary(staff)} disabled={busy || !sForm.amount}>
                    {busy ? 'Saving...' : '💰 Log Salary'}
                  </button>
                </div>

                {showExpenseForm[staff.id] ? (
                  <div className="staff-expense-quick-form">
                    <input
                      type="date"
                      value={eForm.expense_date}
                      onChange={(e) => updateExpenseForm(staff.id, { expense_date: e.target.value })}
                    />
                    <select
                      value={eForm.category}
                      onChange={(e) => updateExpenseForm(staff.id, { category: e.target.value })}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder="What's this for?"
                      value={eForm.description}
                      onChange={(e) => updateExpenseForm(staff.id, { description: e.target.value })}
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Amount (pre-VAT)"
                      value={eForm.amount}
                      onChange={(e) => updateExpenseForm(staff.id, { amount: e.target.value })}
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="VAT"
                      value={eForm.vat_amount}
                      onChange={(e) => updateExpenseForm(staff.id, { vat_amount: e.target.value })}
                    />
                    <select
                      value={eForm.payment_method}
                      onChange={(e) => updateExpenseForm(staff.id, { payment_method: e.target.value })}
                    >
                      <option value="">Paid via...</option>
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="payment_link">Payment Link</option>
                    </select>
                    <button type="button" onClick={() => logExpense(staff)} disabled={busy || !eForm.amount}>
                      {busy ? 'Saving...' : 'Log Expense'}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setShowExpenseForm((prev) => ({ ...prev, [staff.id]: false }))}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="pill-btn"
                    onClick={() => setShowExpenseForm((prev) => ({ ...prev, [staff.id]: true }))}
                  >
                    + Log Other Expense
                  </button>
                )}
              </div>

              {staffExpenses.length > 0 && (
                <details className="case-files">
                  <summary>
                    {staffExpenses.length} logged entr{staffExpenses.length === 1 ? 'y' : 'ies'}
                    {showAllMonths ? '' : ' this month'}
                  </summary>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Category</th>
                        <th>Note</th>
                        <th>Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffExpenses.map((ex) => (
                        <tr key={ex.id}>
                          <td>{ex.expense_date}</td>
                          <td>{CATEGORY_LABELS[ex.category] || ex.category}</td>
                          <td>{ex.description || '—'}</td>
                          <td>AED {money(ex.total)}</td>
                          <td>
                            <button type="button" onClick={() => deleteExpense(ex.id)}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
