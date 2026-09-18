// app/accounting/donations/page.jsx
// Accounting-only (see middleware.js): logging and applying donations is
// the accountant's job, never reachable by PIN-only staff. A donation is
// money for ongoing cases in general, received via Nomod/PayMob/PayPal/
// bank transfer only (never the front desk) — see migration 111. Applying
// a donation to an invoice is just a normal invoice_payments row tagged
// with donation_id, so "which invoice/patient did this donation help" is
// free traceability rather than a separate ledger (see
// app/api/donations/[id]/route.js).

'use client';

import { Fragment, useEffect, useState } from 'react';
import ClientOrPatientSearch from '@/app/_components/ClientOrPatientSearch';

function money(n) {
  return Number(n || 0).toFixed(2);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function invoiceLabel(n) {
  return `INV-${String(n).padStart(6, '0')}`;
}

const SOURCE_LABELS = {
  nomod: 'Nomod',
  paymob: 'PayMob',
  paypal: 'PayPal',
  bank_transfer: 'Bank Transfer',
};

const emptyForm = {
  donor_name: '',
  donor_contact: '',
  amount: '',
  source: '',
  received_at: today(),
  notes: '',
};

export default function DonationsPage() {
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [applyClient, setApplyClient] = useState(null);
  const [applyInvoices, setApplyInvoices] = useState([]);
  const [applyInvoiceId, setApplyInvoiceId] = useState('');
  const [applyAmount, setApplyAmount] = useState('');
  const [applyError, setApplyError] = useState(null);
  const [applying, setApplying] = useState(false);

  function loadDonations() {
    return fetch('/api/donations')
      .then((res) => res.json())
      .then((data) => {
        setDonations(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }

  useEffect(() => {
    loadDonations();
  }, []);

  async function createDonation(e) {
    e.preventDefault();
    if (!form.amount || !form.source) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/donations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        donor_name: form.donor_name || null,
        donor_contact: form.donor_contact || null,
        amount: Number(form.amount),
        source: form.source,
        received_at: form.received_at,
        notes: form.notes || null,
      }),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error || 'Failed to log donation');
      return;
    }
    setForm(emptyForm);
    setShowForm(false);
    loadDonations();
  }

  function resetApplyPanel() {
    setApplyClient(null);
    setApplyInvoices([]);
    setApplyInvoiceId('');
    setApplyAmount('');
    setApplyError(null);
  }

  async function toggleDetail(donation) {
    if (expandedId === donation.id) {
      setExpandedId(null);
      setDetail(null);
      resetApplyPanel();
      return;
    }
    setExpandedId(donation.id);
    resetApplyPanel();
    const res = await fetch(`/api/donations/${donation.id}`);
    const data = await res.json();
    setDetail(data);
  }

  async function pickApplyClient(client) {
    setApplyClient(client);
    setApplyInvoiceId('');
    setApplyError(null);
    const res = await fetch(`/api/invoices?client_id=${client.id}&status=unpaid,partially_paid`);
    const data = await res.json();
    setApplyInvoices(Array.isArray(data) ? data : []);
  }

  async function pickApplyPatient(patient) {
    if (patient.clients) {
      pickApplyClient({ id: patient.clients.id, full_name: patient.clients.full_name });
    }
  }

  async function applyToInvoice(donation) {
    if (!applyInvoiceId || !applyAmount) return;
    setApplying(true);
    setApplyError(null);

    const res = await fetch(`/api/donations/${donation.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: applyInvoiceId, amount: Number(applyAmount) }),
    });
    const data = await res.json();
    setApplying(false);

    if (!res.ok) {
      setApplyError(data.error || 'Failed to apply donation');
      return;
    }
    resetApplyPanel();
    loadDonations();
    const detailRes = await fetch(`/api/donations/${donation.id}`);
    setDetail(await detailRes.json());
  }

  async function deleteDonation(donation) {
    if (!confirm(`Delete donation #${donation.donation_number}? This cannot be undone.`)) return;
    const res = await fetch(`/api/donations/${donation.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Failed to delete donation');
      return;
    }
    if (expandedId === donation.id) {
      setExpandedId(null);
      setDetail(null);
    }
    loadDonations();
  }

  const totalReceived = donations.reduce((sum, d) => sum + Number(d.amount), 0);
  const totalRemaining = donations.reduce((sum, d) => sum + Number(d.remaining), 0);
  const selectedInvoice = applyInvoices.find((inv) => inv.id === applyInvoiceId);

  return (
    <div>
      <div className="page-header">
        <h1>Online Payments</h1>
        <a href="/accounting" className="button-link">
          &larr; Accounting
        </a>
      </div>

      <p className="visit-meta">
        AED {money(totalReceived)} received in total · AED {money(totalRemaining)} not yet applied to an invoice
      </p>

      {showForm ? (
        <form className="note-form" onSubmit={createDonation}>
          {error && <p className="error">{error}</p>}
          <input
            placeholder="Donor name (optional)"
            value={form.donor_name}
            onChange={(e) => setForm({ ...form, donor_name: e.target.value })}
          />
          <input
            placeholder="Donor contact (optional)"
            value={form.donor_contact}
            onChange={(e) => setForm({ ...form, donor_contact: e.target.value })}
          />
          <input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Amount"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
            <option value="">Received via...</option>
            <option value="nomod">Nomod</option>
            <option value="paymob">PayMob</option>
            <option value="paypal">PayPal</option>
            <option value="bank_transfer">Bank Transfer</option>
          </select>
          <input
            type="date"
            value={form.received_at}
            onChange={(e) => setForm({ ...form, received_at: e.target.value })}
          />
          <input
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <button type="submit" disabled={submitting || !form.amount || !form.source}>
            {submitting ? 'Logging...' : 'Log Donation'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setShowForm(false);
              setForm(emptyForm);
              setError(null);
            }}
            disabled={submitting}
          >
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" className="pill-btn" onClick={() => setShowForm(true)}>
          + New Donation
        </button>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : donations.length === 0 ? (
        <p>No donations logged yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>Donor</th>
              <th>Source</th>
              <th>Amount</th>
              <th>Applied</th>
              <th>Remaining</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {donations.map((d) => (
              <Fragment key={d.id}>
                <tr>
                  <td>{d.donation_number}</td>
                  <td>{d.received_at}</td>
                  <td>{d.donor_name || '—'}</td>
                  <td>{SOURCE_LABELS[d.source] || d.source}</td>
                  <td>AED {money(d.amount)}</td>
                  <td>AED {money(d.allocated)}</td>
                  <td>AED {money(d.remaining)}</td>
                  <td>
                    <button type="button" onClick={() => toggleDetail(d)}>
                      {expandedId === d.id ? 'Close' : d.remaining > 0 ? 'Apply / View' : 'View'}
                    </button>
                    {Number(d.allocated) === 0 && (
                      <button type="button" onClick={() => deleteDonation(d)}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
                {expandedId === d.id && (
                  <tr>
                    <td colSpan={8}>
                      {!detail ? (
                        <p>Loading...</p>
                      ) : (
                        <div className="card">
                          {detail.notes && (
                            <p className="visit-meta">
                              <strong>Notes:</strong> {detail.notes}
                            </p>
                          )}
                          {detail.donor_contact && (
                            <p className="visit-meta">
                              <strong>Contact:</strong> {detail.donor_contact}
                            </p>
                          )}

                          <h3>Applied To</h3>
                          {detail.allocations.length === 0 ? (
                            <p className="visit-meta">Not applied to any invoice yet.</p>
                          ) : (
                            <table>
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th>Invoice</th>
                                  <th>Client</th>
                                  <th>Patient</th>
                                  <th>Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.allocations.map((a) => (
                                  <tr key={a.id}>
                                    <td>{new Date(a.paid_at).toLocaleDateString()}</td>
                                    <td>
                                      {a.invoices?.invoice_number ? (
                                        <a href={`/invoices/${a.invoices.id}`}>
                                          {invoiceLabel(a.invoices.invoice_number)}
                                        </a>
                                      ) : (
                                        '—'
                                      )}
                                    </td>
                                    <td>{a.invoices?.clients?.full_name || '—'}</td>
                                    <td>
                                      {a.invoices?.visits?.patients?.name ||
                                        a.invoices?.hospitalizations?.patients?.name ||
                                        '—'}
                                    </td>
                                    <td>AED {money(a.amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}

                          {detail.remaining > 0 && (
                            <>
                              <h3>Apply to an Invoice</h3>
                              {applyError && <p className="error">{applyError}</p>}
                              <p className="visit-meta">
                                AED {money(detail.remaining)} of this donation is not yet applied.
                              </p>
                              <ClientOrPatientSearch
                                onPickClient={pickApplyClient}
                                onPickPatient={pickApplyPatient}
                                placeholder="Find the client or patient to apply this donation to..."
                              />
                              {applyClient && (
                                <div className="note-form">
                                  <p className="visit-meta">
                                    Client: <strong>{applyClient.full_name}</strong>
                                  </p>
                                  {applyInvoices.length === 0 ? (
                                    <p className="visit-meta">No unpaid or partially paid invoices for this client.</p>
                                  ) : (
                                    <>
                                      <select
                                        value={applyInvoiceId}
                                        onChange={(e) => {
                                          setApplyInvoiceId(e.target.value);
                                          const inv = applyInvoices.find((i) => i.id === e.target.value);
                                          if (inv) {
                                            const invRemaining =
                                              Math.round((Number(inv.total) - Number(inv.amount_paid)) * 100) / 100;
                                            setApplyAmount(
                                              String(Math.min(invRemaining, Number(detail.remaining)))
                                            );
                                          }
                                        }}
                                      >
                                        <option value="">Choose an invoice...</option>
                                        {applyInvoices.map((inv) => {
                                          const bal =
                                            Math.round((Number(inv.total) - Number(inv.amount_paid)) * 100) / 100;
                                          return (
                                            <option key={inv.id} value={inv.id}>
                                              {invoiceLabel(inv.invoice_number)} — balance AED {money(bal)}
                                            </option>
                                          );
                                        })}
                                      </select>
                                      {selectedInvoice && (
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0.01"
                                          max={Math.min(
                                            Math.round(
                                              (Number(selectedInvoice.total) - Number(selectedInvoice.amount_paid)) *
                                                100
                                            ) / 100,
                                            Number(detail.remaining)
                                          )}
                                          placeholder="Amount to apply"
                                          value={applyAmount}
                                          onChange={(e) => setApplyAmount(e.target.value)}
                                        />
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => applyToInvoice(d)}
                                        disabled={applying || !applyInvoiceId || !applyAmount}
                                      >
                                        {applying ? 'Applying...' : 'Apply Donation'}
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
