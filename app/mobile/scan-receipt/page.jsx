// app/mobile/scan-receipt/page.jsx
// Quick-capture expense logging from the field: photograph a supplier
// receipt, review what Claude read off it, then save it straight into
// the accounting system. Deliberately not behind the /accounting
// password — any staff member with the mobile app can contribute a
// receipt this way, they just can't browse the ledger itself (see the
// carve-out for POST /api/expenses and /api/expenses/scan in
// middleware.js). The photo is saved as a regular attachment on the new
// expense, same as everywhere else in the app (see lib/attachments.js).

'use client';

import { useState } from 'react';
import { uploadAttachment } from '@/lib/attachments';
import ScanReceiptButton from '@/app/_components/ScanReceiptButton';
import MobileHomeButton from '@/app/_components/MobileHomeButton';

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

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function MobileScanReceiptPage() {
  const [form, setForm] = useState(null); // null until something's been scanned
  const [receiptFile, setReceiptFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [attachError, setAttachError] = useState(null);

  function handleScanned(data) {
    setSaved(false);
    setError(null);
    setAttachError(null);
    setForm({
      expense_date: data.expense_date || today(),
      vendor_name: data.vendor_name || '',
      description: '',
      category: data.category || 'other',
      amount: data.amount !== null && data.amount !== undefined ? String(data.amount) : '',
      vat_amount: data.vat_amount !== null && data.vat_amount !== undefined ? String(data.vat_amount) : '',
      payment_method: '',
    });
    setReceiptFile(data.file || null);
  }

  function updateForm(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function startOver() {
    setForm(null);
    setReceiptFile(null);
    setError(null);
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
        // Set separately from `error` (which lives inside the form and
        // disappears once it's cleared below) so this stays visible on
        // the "saved" screen — the expense itself did save successfully.
        setAttachError(`The expense saved, but the receipt photo failed to attach: ${err.message}`);
      }
    }

    setForm(null);
    setReceiptFile(null);
    setSaved(true);
    setSubmitting(false);
  }

  return (
    <div className="mobile-page">
      <MobileHomeButton />
      <h1>Scan Receipt</h1>

      {saved && <p style={{ color: '#1a7a3d' }}>Expense saved.</p>}
      {attachError && <p className="error">{attachError}</p>}

      {!form ? (
        <>
          <p className="mobile-subtitle">Photograph a supplier receipt to log it as an expense.</p>
          <ScanReceiptButton onScanned={handleScanned} />
        </>
      ) : (
        <form className="card" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}

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

          <button type="submit" disabled={submitting || !form.amount}>
            {submitting ? 'Saving...' : 'Save Expense'}
          </button>
          <button type="button" onClick={startOver} disabled={submitting}>
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
