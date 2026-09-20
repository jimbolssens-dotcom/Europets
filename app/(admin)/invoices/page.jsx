// app/invoices/page.jsx
// Invoice list + builder. The list itself is a compact row per invoice
// (owner, patient, invoice #, date, total, outstanding, status) — clicking
// a row drops down the full invoice: line items, totals, the add-item
// form, and the payment panel. That detail is only fetched and only stays
// live via realtime while its row is expanded, so opening a filtered view
// with many invoices doesn't open a realtime channel and a detail fetch
// for every single one of them up front. VAT is UAE standard 5%, computed
// server-side.

'use client';

import { Fragment, Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import CatalogPicker from '@/app/_components/CatalogPicker';
import ClientOrPatientSearch from '@/app/_components/ClientOrPatientSearch';
import InvoicePaymentPanel from '@/app/_components/InvoicePaymentPanel';
import InvoiceDiscountPanel from '@/app/_components/InvoiceDiscountPanel';
import { groupLineItemsByCategory, ADD_ITEM_LABELS } from '@/lib/catalogGrouping';
import { formatShortDate, formatDateTime } from '@/lib/formatTimestamp';
import { openWhatsApp } from '@/lib/whatsapp';

function money(n) {
  return Number(n || 0).toFixed(2);
}

const STATUS_LABELS = {
  unpaid: 'unpaid',
  partially_paid: 'partially paid',
  paid: 'paid',
  void: 'void',
};

// Maps a status to the compact row's dot/pill color — 'partial' and 'void'
// are their own shorter class names distinct from the full status keys.
const STATUS_DOT_CLASS = {
  unpaid: 'unpaid',
  partially_paid: 'partial',
  paid: 'paid',
  void: 'void',
};

function balanceDueFor(summary) {
  return Math.max(0, Math.round((Number(summary.total) - Number(summary.amount_paid || 0)) * 100) / 100);
}

function patientNameFor(summary) {
  return summary.visits?.patients?.name || summary.hospitalizations?.patients?.name || '';
}

function InvoiceRow({ summary, catalog, subcategories, staff, onCatalogChange, onChanged }) {
  const [expanded, setExpanded] = useState(false);
  const [invoice, setInvoice] = useState(null);
  const [goodsServiceId, setGoodsServiceId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [addCategory, setAddCategory] = useState('product');
  const [paymentLinkError, setPaymentLinkError] = useState(null);

  const loadInvoice = () =>
    fetch(`/api/invoices/${summary.id}`)
      .then((res) => res.json())
      .then(setInvoice);

  // Only fetch the full invoice (line items, payments) and only keep a
  // realtime channel open for it while this row is actually expanded —
  // collapsed rows already have everything they need to display from
  // `summary` (see the page-level invoices-table subscription below for
  // how those stay live too).
  useEffect(() => {
    if (!expanded) return;
    loadInvoice();

    const channel = supabase
      .channel(`invoice-${summary.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoice_line_items', filter: `invoice_id=eq.${summary.id}` },
        () => loadInvoice()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoices', filter: `id=eq.${summary.id}` },
        () => {
          loadInvoice();
          onChanged();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoice_payments', filter: `invoice_id=eq.${summary.id}` },
        () => loadInvoice()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, summary.id]);

  async function addLineItem(e) {
    e.preventDefault();
    if (!goodsServiceId) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/invoices/${summary.id}/line-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goods_service_id: goodsServiceId,
        quantity: quantity ? Number(quantity) : undefined,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Failed to add item');
    } else {
      setGoodsServiceId('');
      setQuantity('');
      loadInvoice();
    }
    setSubmitting(false);
  }

  async function removeLineItem(itemId) {
    setError(null);
    const res = await fetch(`/api/invoices/${summary.id}/line-items/${itemId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Failed to remove item');
      return;
    }
    loadInvoice();
  }

  // Same handoff as the full invoice page's own Payment Link button — no
  // link is generated here, it just points the client at their "Settle
  // Your Bill" page (website/app/settle-bill/[id]), which creates the
  // actual Nomod link itself for whatever the balance happens to be.
  function sendPaymentLink() {
    setPaymentLinkError(null);
    const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL || 'https://epc.vet';
    const url = `${websiteUrl}/settle-bill/${summary.id}`;
    const digits = (invoice.clients?.phone || '').replace(/\D/g, '');
    const message = `Hi ${invoice.clients?.full_name || ''}! You can settle your Europets Clinic invoice online here: ${url}`;
    if (digits.length > 3) {
      openWhatsApp(invoice.clients?.phone, message);
    } else {
      navigator.clipboard.writeText(url);
      setPaymentLinkError('No phone number on file — link copied to clipboard instead.');
    }
  }

  const selected = catalog.find((c) => c.id === goodsServiceId);
  const patientName = patientNameFor(summary);
  const balanceDue = balanceDueFor(summary);
  const dotClass = STATUS_DOT_CLASS[summary.status] || 'unpaid';
  const invoiceNumberLabel = summary.invoice_number
    ? `INV-${String(summary.invoice_number).padStart(6, '0')}`
    : '';

  const lineItemGroups = invoice ? groupLineItemsByCategory(invoice.line_items) : [];
  const editable = invoice && (invoice.status === 'unpaid' || invoice.status === 'partially_paid');
  const columnCount = editable ? 5 : 4;

  return (
    <div className="invoice-row-card">
      <button
        type="button"
        className="invoice-row-summary"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={`status-dot ${dotClass}`}></span>
        <span className="invoice-row-name-wrap">
          <span className="invoice-row-name">
            {summary.clients?.full_name}
            {patientName && <span className="invoice-row-patient"> — {patientName}</span>}
          </span>
          {invoiceNumberLabel && <span className="invoice-row-inv">{invoiceNumberLabel}</span>}
        </span>
        <span className="invoice-row-date">{formatShortDate(summary.created_at)}</span>
        <span className="invoice-row-total">AED {money(summary.total)}</span>
        <span className={`invoice-row-due${balanceDue === 0 ? ' zero' : ''}`}>AED {money(balanceDue)}</span>
        <span className={`status-pill ${dotClass}`}>{STATUS_LABELS[summary.status] || summary.status}</span>
        <svg className="invoice-row-chev" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div className="invoice-row-detail">
          {!invoice ? (
            <p>Loading...</p>
          ) : (
            <>
              <p className="invoice-row-detail-link">
                <a href={`/invoices/${summary.id}`}>Open full invoice page ↗</a>
                {invoice.paid_at && ` · Paid: ${formatShortDate(invoice.paid_at)}`}
              </p>

              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Unit price</th>
                    <th>Line total</th>
                    {editable && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {lineItemGroups.map((group) => (
                    <Fragment key={group.mainCategory || 'other'}>
                      <tr className="invoice-category-row">
                        <td colSpan={columnCount}>{group.label}</td>
                      </tr>
                      {group.items.map((li) => (
                        <tr key={li.id}>
                          <td>{li.description}</td>
                          <td>
                            {li.quantity} {li.goods_services?.unit || ''}
                          </td>
                          <td>{money(li.unit_price)}</td>
                          <td>{money(li.line_total)}</td>
                          {editable && (
                            <td>
                              <button type="button" onClick={() => removeLineItem(li.id)}>
                                Remove
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                  {invoice.line_items.length === 0 && (
                    <tr>
                      <td colSpan={5}>No line items yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <p>
                Subtotal: {money(invoice.subtotal)}
                {Number(invoice.discount_amount) > 0 && <> · Discount: -{money(invoice.discount_amount)}</>}
                {' '}· VAT (5%): {money(invoice.vat_amount)} · <strong>Total: {money(invoice.total)}</strong>
              </p>

              {editable && (
                <form className="note-form catalog-add-form" onSubmit={addLineItem}>
                  {error && <p className="error">{error}</p>}
                  <CatalogPicker
                    catalog={catalog}
                    subcategories={subcategories}
                    value={goodsServiceId}
                    onChange={setGoodsServiceId}
                    onItemCreated={onCatalogChange}
                    onCategoryChange={setAddCategory}
                  />
                  <div className="catalog-add-form-row">
                    <input
                      className="qty-input"
                      type="number"
                      step="0.01"
                      placeholder={selected?.pricing_type === 'per_kg' ? 'kg (blank = patient weight)' : 'qty (default 1)'}
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />
                    <button type="submit" disabled={submitting || !goodsServiceId}>
                      + Add
                    </button>
                  </div>
                </form>
              )}

              <InvoiceDiscountPanel
                invoice={invoice}
                staff={staff}
                onChanged={() => {
                  loadInvoice();
                  onChanged();
                }}
              />

              {paymentLinkError && <p className="error">{paymentLinkError}</p>}

              <InvoicePaymentPanel
                invoice={invoice}
                staff={staff}
                onChanged={() => {
                  loadInvoice();
                  onChanged();
                }}
                onSendPaymentLink={sendPaymentLink}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

const emptyForm = { client_id: '', visit_id: '' };

export default function InvoicesPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <InvoicesPageInner />
    </Suspense>
  );
}

// An "Invoice" link elsewhere (the patient/client detail pages, for
// invoicing something without a consult) can land here with ?client_id=
// already known — resolve the owner's name for display and pre-fill the
// Open Invoice form, scrolled into view, same pattern as the Consults and
// Appointments pages' own deep links.
function InvoicesPageInner() {
  const searchParams = useSearchParams();
  const openInvoiceFormRef = useRef(null);
  const [invoices, setInvoices] = useState([]);
  const [selectedOwner, setSelectedOwner] = useState(null); // { id, full_name } for the client currently picked below
  const [visits, setVisits] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('unpaid,partially_paid');
  const [quotes, setQuotes] = useState([]);
  const [discardingQuoteId, setDiscardingQuoteId] = useState(null);

  const loadInvoices = (status) =>
    fetch(`/api/invoices${status ? `?status=${status}` : ''}`)
      .then((res) => res.json())
      .then((data) => {
        setInvoices(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  // Proforma quotes have no status/payment concept of their own — kept as
  // a separate list entirely, fetched only while this filter is selected,
  // rather than forced through the paid/unpaid/void invoice shape.
  const loadQuotes = () =>
    fetch('/api/proforma-invoices')
      .then((res) => res.json())
      .then((data) => {
        setQuotes(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    setLoading(true);
    if (statusFilter === 'proforma') loadQuotes();
    else loadInvoices(statusFilter);
  }, [statusFilter]);

  async function discardQuote(quoteId) {
    if (!confirm('Discard this quote? This cannot be undone.')) return;
    setDiscardingQuoteId(quoteId);
    await fetch(`/api/proforma-invoices/${quoteId}`, { method: 'DELETE' });
    setDiscardingQuoteId(null);
    loadQuotes();
  }

  // One list-level subscription keeps every collapsed row's total/status
  // fresh (e.g. another terminal logs a payment) without opening a
  // per-invoice realtime channel for every row up front — those only open
  // once a row is actually expanded (see InvoiceRow above).
  const statusFilterRef = useRef(statusFilter);
  useEffect(() => {
    statusFilterRef.current = statusFilter;
  }, [statusFilter]);

  useEffect(() => {
    const channel = supabase
      .channel('invoices-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
        if (statusFilterRef.current !== 'proforma') loadInvoices(statusFilterRef.current);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proforma_invoices' }, () => {
        if (statusFilterRef.current === 'proforma') loadQuotes();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/visits').then((res) => res.json()),
      fetch('/api/goods-services?active=true').then((res) => res.json()),
      fetch('/api/catalog-subcategories').then((res) => res.json()),
      fetch('/api/staff').then((res) => res.json()),
    ]).then(([visitsData, catalogData, subcategoriesData, staffData]) => {
      setVisits(Array.isArray(visitsData) ? visitsData : []);
      setCatalog(Array.isArray(catalogData) ? catalogData : []);
      setSubcategories(Array.isArray(subcategoriesData) ? subcategoriesData : []);
      setStaff(Array.isArray(staffData) ? staffData : []);
    });
  }, []);

  useEffect(() => {
    const clientId = searchParams.get('client_id');
    if (!clientId) return;
    fetch(`/api/clients/${clientId}`)
      .then((res) => res.json())
      .then((client) => {
        if (!client || client.error) return;
        setSelectedOwner({ id: client.id, full_name: client.full_name });
        setForm((f) => ({ ...f, client_id: clientId }));
        openInvoiceFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addCatalogItem(item) {
    setCatalog((prev) => [...prev, item]);
  }

  const visitsForClient = visits.filter((v) => v.client_id === form.client_id);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.client_id) {
      setError('Select a client');
      return;
    }
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: form.client_id, visit_id: form.visit_id || null }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Failed to open invoice');
    } else {
      setForm(emptyForm);
      setSelectedOwner(null);
      loadInvoices(statusFilter);
    }
    setSubmitting(false);
  }

  return (
    <div>
      <h1>Invoices</h1>

      <div className="split">
      <div className="split-main">
      <label>
        Filter:{' '}
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="unpaid,partially_paid">Unpaid + Partially Paid</option>
          <option value="unpaid">Unpaid</option>
          <option value="partially_paid">Partially Paid</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
          <option value="">All</option>
          <option value="proforma">Quotes (Proforma)</option>
        </select>
      </label>

      {statusFilter === 'proforma' ? (
        loading ? (
          <p>Loading quotes...</p>
        ) : quotes.length === 0 ? (
          <p>No proforma quotes on file.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Patient</th>
                <th>Items</th>
                <th>Est. Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const items = q.proforma_invoice_items || [];
                const subtotal = items.reduce((sum, item) => sum + Number(item.line_total), 0);
                const total = Math.round(subtotal * 1.05 * 100) / 100;
                return (
                  <tr key={q.id}>
                    <td>{formatShortDate(q.created_at)}</td>
                    <td>
                      {q.clients?.full_name}
                      {q.clients?.client_number ? ` (Client #${q.clients.client_number})` : ''}
                    </td>
                    <td>{q.patients?.name}</td>
                    <td>{items.length}</td>
                    <td>AED {money(total)}</td>
                    <td>
                      <a href={`/proforma/${q.id}`} className="button-link button-link-open">Open</a>{' '}
                      <button type="button" onClick={() => discardQuote(q.id)} disabled={discardingQuoteId === q.id}>
                        {discardingQuoteId === q.id ? 'Discarding…' : 'Discard'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      ) : loading ? (
        <p>Loading invoices...</p>
      ) : invoices.length === 0 ? (
        <p>No invoices in this view.</p>
      ) : (
        <div className="invoice-row-list">
          {invoices.map((inv) => (
            <InvoiceRow
              key={inv.id}
              summary={inv}
              catalog={catalog}
              subcategories={subcategories}
              staff={staff}
              onCatalogChange={addCatalogItem}
              onChanged={() => loadInvoices(statusFilter)}
            />
          ))}
        </div>
      )}
      </div>

      <div className="split-aside">
      <form className="card" onSubmit={handleSubmit} ref={openInvoiceFormRef}>
        <h2>Open Invoice</h2>
        {error && <p className="error">{error}</p>}
        {selectedOwner ? (
          <p className="booking-owner-picked">
            Client: <strong>{selectedOwner.full_name}</strong>{' '}
            <button
              type="button"
              onClick={() => {
                setSelectedOwner(null);
                setForm({ ...form, client_id: '', visit_id: '' });
              }}
            >
              Change
            </button>
          </p>
        ) : (
          <ClientOrPatientSearch
            placeholder="Search for the client..."
            onPickClient={(c) => {
              setSelectedOwner({ id: c.id, full_name: c.full_name });
              setForm({ ...form, client_id: c.id, visit_id: '' });
            }}
            onPickPatient={(p) => {
              setSelectedOwner({ id: p.client_id, full_name: p.clients?.full_name || '' });
              setForm({ ...form, client_id: p.client_id, visit_id: '' });
            }}
          />
        )}
        <select
          disabled={!form.client_id}
          value={form.visit_id}
          onChange={(e) => setForm({ ...form, visit_id: e.target.value })}
        >
          <option value="">Link to a visit (optional)...</option>
          {visitsForClient.map((v) => (
            <option key={v.id} value={v.id}>
              {v.patients?.name} — {formatDateTime(v.started_at)}
            </option>
          ))}
        </select>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Opening...' : 'Open'}
        </button>
      </form>
      </div>
      </div>
    </div>
  );
}
