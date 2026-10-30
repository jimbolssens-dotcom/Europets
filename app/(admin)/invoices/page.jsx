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

import { websiteUrl as clinicWebsiteUrl } from '@/lib/websiteUrl';
import { Fragment, Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import CatalogPicker from '@/app/_components/CatalogPicker';
import { INVOICE_SEARCH_FIELDS } from '@/lib/invoiceSearch';

const emptyInvoiceSearch = Object.fromEntries(INVOICE_SEARCH_FIELDS.map((f) => [f.key, '']));
const INVOICE_FIELD_INPUT_MODE = { invoice_no: 'numeric', client_no: 'numeric', patient_no: 'numeric', phone: 'tel', amount: 'decimal' };
const INVOICE_FIELD_HINTS = {
  invoice_no: 'Invoice number: 916, INV-000916',
  client_no: 'Client number',
  patient_no: 'Patient number: the pet\'s invoices',
  name: 'Part of the client\'s or the pet\'s name',
  phone: 'Part of the client\'s phone number',
  date: 'Date made: 28/10, 28/10/2026, 2026-10-28, 28 Oct, Oct 2026',
  item: 'An item on the invoice, e.g. PCR',
  amount: 'The invoice total, e.g. 619.50',
};
import InvoicePaymentPanel from '@/app/_components/InvoicePaymentPanel';
import InvoiceDiscountPanel from '@/app/_components/InvoiceDiscountPanel';
import { groupLineItemsByCategory, ADD_ITEM_LABELS } from '@/lib/catalogGrouping';
import { formatShortDate, formatDateTime } from '@/lib/formatTimestamp';
import { sendPaymentMessage } from '@/lib/sendPaymentMessageClient';
import { openWhatsApp } from '@/lib/whatsapp';
import { loadReferenceList, readViewCache, useRestoredView, writeViewCache } from '@/lib/viewCache';
import PhoneTop from '@/app/_components/PhoneTop';

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
  const [lineItemDrafts, setLineItemDrafts] = useState({}); // line item id -> { quantity, timesGiven } while typing, before it's saved on blur
  const [lineItemEditError, setLineItemEditError] = useState(null);

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

  // Correcting an already-added line's per-dose quantity or how many times
  // it was given — same draft-on-blur pattern as the full invoice page (see
  // app/(admin)/invoices/[id]/page.jsx), so this compact row-expansion view
  // can fix the same mistakes without opening that page.
  async function saveLineItemField(itemId, patch) {
    setLineItemEditError(null);
    const res = await fetch(`/api/invoices/${summary.id}/line-items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = await res.json();
      setLineItemEditError(data.error || 'Failed to save changes');
      return;
    }
    setLineItemDrafts((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    loadInvoice();
  }

  function commitLineItemQuantity(li, value) {
    const quantity = Number(value);
    if (!value || Number.isNaN(quantity) || quantity <= 0 || quantity === Number(li.quantity)) {
      setLineItemDrafts((prev) => {
        const next = { ...prev };
        delete next[li.id];
        return next;
      });
      return;
    }
    saveLineItemField(li.id, { quantity });
  }

  function commitLineItemTimesGiven(li, value) {
    const timesGiven = Number(value);
    const current = Number(li.times_given) || 1;
    if (!value || !Number.isInteger(timesGiven) || timesGiven <= 0 || timesGiven === current) {
      setLineItemDrafts((prev) => {
        const next = { ...prev };
        delete next[li.id];
        return next;
      });
      return;
    }
    saveLineItemField(li.id, { times_given: timesGiven });
  }

  // Same handoff as the full invoice page's own Payment Link button — no
  // link is generated here, it just points the client at their "Settle
  // Your Bill" page (website/app/settle-bill/[id]), which creates the
  // actual Nomod link itself for whatever the balance happens to be.
  async function sendPaymentLink() {
    setPaymentLinkError(null);
    const websiteUrl = clinicWebsiteUrl();
    const url = `${websiteUrl}/settle-bill/${summary.id}`;
    const digits = (invoice.clients?.phone || '').replace(/\D/g, '');
    const message = `Hi ${invoice.clients?.full_name || ''}! You can settle your Europets Clinic invoice online here: ${url}`;
    if (digits.length > 3) {
      const result = await sendPaymentMessage({ invoiceId: summary.id, phone: invoice.clients?.phone, fallbackMessage: message });
      setPaymentLinkError(result.note);
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
  const columnCount = editable ? 6 : 5;

  return (
    <div className="invoice-row-card">
      <button
        type="button"
        className={`invoice-row-summary${balanceDue === 0 ? ' is-settled' : ''}`}
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
        <span className={`invoice-row-due${balanceDue === 0 ? ' zero' : ''}`}>
          AED {money(balanceDue)}
          <span className="invoice-row-due-label"> due</span>
        </span>
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

              {lineItemEditError && <p className="error">{lineItemEditError}</p>}
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>#</th>
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
                      {group.items.map((li) => {
                        const draft = lineItemDrafts[li.id];
                        return (
                          <tr key={li.id}>
                            <td>{li.description}</td>
                            <td>
                              {editable ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  className="qty-input"
                                  value={draft?.quantity ?? li.quantity}
                                  onChange={(e) =>
                                    setLineItemDrafts({ ...lineItemDrafts, [li.id]: { ...draft, quantity: e.target.value } })
                                  }
                                  onBlur={(e) => commitLineItemQuantity(li, e.target.value)}
                                />
                              ) : (
                                <>
                                  {li.quantity} {li.goods_services?.unit || ''}
                                </>
                              )}
                            </td>
                            <td>
                              {editable ? (
                                <input
                                  type="number"
                                  step="1"
                                  min="1"
                                  className="qty-input"
                                  value={draft?.timesGiven ?? li.times_given ?? 1}
                                  onChange={(e) =>
                                    setLineItemDrafts({ ...lineItemDrafts, [li.id]: { ...draft, timesGiven: e.target.value } })
                                  }
                                  onBlur={(e) => commitLineItemTimesGiven(li, e.target.value)}
                                />
                              ) : (
                                <>{li.times_given ?? 1}×</>
                              )}
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
                        );
                      })}
                    </Fragment>
                  ))}
                  {invoice.line_items.length === 0 && (
                    <tr>
                      <td colSpan={columnCount}>No line items yet.</td>
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

              {paymentLinkError && <p className={paymentLinkError.startsWith('✅') || paymentLinkError.startsWith('Opened') ? 'visit-meta' : 'error'}>{paymentLinkError}</p>}

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

// How many invoices the Paid / Void / All views load before "Show older".
const RECENT_INVOICES = 150;

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
  // The search fields (GET /api/invoices?invoice_no=&client_no=..., see
  // lib/invoiceSearch.js), one per thing like the Clients page's search:
  // each matches only its own thing, and filled fields must all match.
  // While any is filled, the results replace the filtered list.
  const [search, setSearch] = useState(emptyInvoiceSearch);
  const [searchResults, setSearchResults] = useState(null); // { rows, total } | null
  const [searching, setSearching] = useState(false);
  const searchSeqRef = useRef(0);
  const searchActive = Object.values(search).some((v) => v.trim());
  const runSearch = (fields) => {
    const seq = ++searchSeqRef.current;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) if (value.trim()) params.set(key, value.trim());
    if (![...params.keys()].length) {
      setSearchResults(null);
      setSearching(false);
      return Promise.resolve();
    }
    setSearching(true);
    return fetch(`/api/invoices?${params}`)
      .then(async (res) => {
        const rows = await res.json();
        if (seq !== searchSeqRef.current) return;
        setSearchResults({ rows: Array.isArray(rows) ? rows : [], total: Number(res.headers.get('X-Total-Matches')) || (Array.isArray(rows) ? rows.length : 0) });
      })
      .catch(() => seq === searchSeqRef.current && setSearchResults({ rows: [], total: 0 }))
      .finally(() => seq === searchSeqRef.current && setSearching(false));
  };
  useEffect(() => {
    const t = setTimeout(() => runSearch(search), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  // The same fields find the client to open a new invoice for: Client #,
  // Name and Phone through the clients search, Patient # and Name through
  // the pets (their owners). The only client search on the page.
  const [owners, setOwners] = useState([]); // [{ id, full_name, client_number, pets }]
  const ownerSeqRef = useRef(0);
  useEffect(() => {
    const clientNo = search.client_no.trim();
    const patientNo = search.patient_no.trim().replace(/^#/, '');
    const name = search.name.trim();
    const phone = search.phone.replace(/\D/g, '');
    const seq = ++ownerSeqRef.current;
    if (!clientNo && !patientNo && name.length < 2 && phone.length < 4) {
      setOwners([]);
      return undefined;
    }
    const t = setTimeout(async () => {
      const clientParams = new URLSearchParams();
      if (clientNo) clientParams.set('client_number', clientNo);
      if (phone.length >= 4) clientParams.set('phone', phone.slice(-9));
      const petParams = new URLSearchParams();
      if (patientNo) petParams.set('patient_number', patientNo);
      const asJson = (url) => fetch(url).then((r) => r.json()).then((d) => (Array.isArray(d) ? d : [])).catch(() => []);
      const [byClient, byClientName, byPet] = await Promise.all([
        clientNo || phone.length >= 4 ? asJson(`/api/clients?${clientParams}${name.length >= 2 && !patientNo ? `&name=${encodeURIComponent(name)}` : ''}`) : [],
        !clientNo && phone.length < 4 && !patientNo && name.length >= 2 ? asJson(`/api/clients?name=${encodeURIComponent(name)}`) : [],
        patientNo || (!clientNo && phone.length < 4 && name.length >= 2)
          ? asJson(`/api/patients?${patientNo ? petParams : `name=${encodeURIComponent(name)}`}`)
          : [],
      ]);
      if (seq !== ownerSeqRef.current) return;
      const found = new Map();
      for (const c of [...byClient, ...byClientName]) found.set(c.id, { id: c.id, full_name: c.full_name, client_number: c.client_number, pets: [] });
      for (const pet of byPet) {
        if (!pet.client_id) continue;
        if (clientNo && !found.has(pet.client_id)) continue;
        const o = found.get(pet.client_id) || { id: pet.client_id, full_name: pet.clients?.full_name || '', client_number: null, pets: [] };
        o.pets.push(pet.name);
        found.set(pet.client_id, o);
      }
      setOwners([...found.values()].slice(0, 6));
    }, 350);
    return () => clearTimeout(t);
  }, [search.client_no, search.patient_no, search.name, search.phone]);
  const [quotes, setQuotes] = useState([]);
  const [discardingQuoteId, setDiscardingQuoteId] = useState(null);

  // Paid, Void and All grow with every invoice ever made: they show the
  // newest RECENT_INVOICES, and "Show older invoices" loads the rest.
  // Unpaid / partially paid is the working list and always shows in full.
  const [showOlder, setShowOlder] = useState(false);
  const showOlderRef = useRef(false);
  const isLongView = (status) => status === 'paid' || status === 'void' || status === '';

  // Switching the filter quickly (or realtime reloads) can bring replies
  // back out of order: only the newest request's answer is used.
  const loadSeqRef = useRef(0);
  const loadInvoices = (status) => {
    const seq = ++loadSeqRef.current;
    const limited = isLongView(status) && !showOlderRef.current;
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (limited) params.set('limit', String(RECENT_INVOICES));
    return fetch(`/api/invoices${params.toString() ? `?${params}` : ''}`)
      .then((res) => res.json())
      .then((data) => {
        if (seq !== loadSeqRef.current) return;
        setInvoices(Array.isArray(data) ? data : []);
        setLoading(false);
        if (Array.isArray(data) && !showOlderRef.current) writeViewCache(`europets-invoices-v1:${status}`, data);
      });
  };

  function loadOlderInvoices() {
    showOlderRef.current = true;
    setShowOlder(true);
    loadInvoices(statusFilter);
  }

  // Proforma quotes have no status/payment concept of their own — kept as
  // a separate list entirely, fetched only while this filter is selected,
  // rather than forced through the paid/unpaid/void invoice shape.
  const loadQuotes = () => {
    const seq = ++loadSeqRef.current;
    return fetch('/api/proforma-invoices')
      .then((res) => res.json())
      .then((data) => {
        if (seq !== loadSeqRef.current) return;
        setQuotes(Array.isArray(data) ? data : []);
        setLoading(false);
        if (Array.isArray(data)) writeViewCache('europets-invoices-v1:proforma', data);
      });
  };

  // This filter's list as it last loaded, shown at once while the fresh
  // one loads (lib/viewCache.js).
  const cacheKey = `europets-invoices-v1:${statusFilter}`;
  useRestoredView(cacheKey, (data) => {
    if (!Array.isArray(data)) return;
    if (statusFilter === 'proforma') setQuotes(data);
    else setInvoices(data);
    setLoading(false);
  });

  useEffect(() => {
    showOlderRef.current = false;
    setShowOlder(false);
    if (readViewCache(cacheKey) == null) setLoading(true);
    if (statusFilter === 'proforma') loadQuotes();
    else loadInvoices(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Pickers: the last copy at once, then the fresh one (lib/viewCache.js).
    loadReferenceList('/api/goods-services?active=true', setCatalog);
    loadReferenceList('/api/catalog-subcategories', setSubcategories);
    loadReferenceList('/api/staff', setStaff);
  }, []);

  // The "Link to a visit" picker only lists the chosen client's visits, so
  // only those are fetched, once a client is picked (it used to fetch every
  // consult there has ever been on opening the page).
  useEffect(() => {
    if (!form.client_id) {
      setVisits([]);
      return;
    }
    let current = true;
    fetch(`/api/visits?client_id=${form.client_id}`)
      .then((res) => res.json())
      .then((data) => {
        if (current) setVisits(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [form.client_id]);

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
      <div className="page-header">
        <h1>Invoices</h1>
        <div className="page-header-actions phone-hide">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter">
            <option value="unpaid,partially_paid">Unpaid + Partially Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="partially_paid">Partially Paid</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
            <option value="">All</option>
            <option value="proforma">Quotes (Proforma)</option>
          </select>
        </div>
      </div>

      <div className="split invoices-split">
      <div className="split-main">
      <PhoneTop>
        <select className="phone-top-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter">
          <option value="unpaid,partially_paid">Unpaid + part</option>
          <option value="unpaid">Unpaid</option>
          <option value="partially_paid">Part paid</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
          <option value="">All</option>
          <option value="proforma">Quotes</option>
        </select>
      </PhoneTop>
      {searchResults || searching ? (
        searching && !searchResults ? (
          <p className="visit-meta">Searching…</p>
        ) : searchResults.rows.length === 0 ? (
          <p>
            No invoices match.{' '}
            <button type="button" className="invoice-search-clear-link" onClick={() => setSearch(emptyInvoiceSearch)}>Clear search</button>
          </p>
        ) : (
          <div className="invoice-row-list">
            <p className="visit-meta invoice-search-count">
              {searchResults.total} invoice{searchResults.total === 1 ? '' : 's'} match{searchResults.total === 1 ? 'es' : ''}
              {searchResults.total > searchResults.rows.length ? `, showing the newest ${searchResults.rows.length}` : ''} · all statuses ·{' '}
              <button type="button" className="invoice-search-clear-link" onClick={() => setSearch(emptyInvoiceSearch)}>Clear search</button>
            </p>
            {searchResults.rows.map((inv) => (
              <InvoiceRow
                key={inv.id}
                summary={inv}
                catalog={catalog}
                subcategories={subcategories}
                staff={staff}
                onCatalogChange={addCatalogItem}
                onChanged={() => runSearch(search)}
              />
            ))}
          </div>
        )
      ) : statusFilter === 'proforma' ? (
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
          {isLongView(statusFilter) && !showOlder && invoices.length >= RECENT_INVOICES && (
            <button type="button" className="secondary" onClick={loadOlderInvoices}>
              Show older invoices
            </button>
          )}
        </div>
      )}
      </div>

      <div className="split-aside">
      <form className="card invoice-find-card" onSubmit={handleSubmit} ref={openInvoiceFormRef}>
        <h2>Search &amp; open invoice</h2>
        {error && <p className="error">{error}</p>}
        <div className="invoice-field-search">
          {INVOICE_SEARCH_FIELDS.map((f) => (
            <input
              key={f.key}
              type="text"
              inputMode={INVOICE_FIELD_INPUT_MODE[f.key] || 'text'}
              enterKeyHint="search"
              placeholder={f.label}
              title={INVOICE_FIELD_HINTS[f.key]}
              aria-label={`Search by ${f.label.toLowerCase()}`}
              value={search[f.key]}
              onChange={(e) => setSearch({ ...search, [f.key]: e.target.value })}
            />
          ))}
        </div>
        {searchActive && (
          <p className="invoice-find-hint phone-hide">
            Matching invoices are in the list.{' '}
            <button type="button" className="invoice-search-clear-link" onClick={() => setSearch(emptyInvoiceSearch)}>Clear</button>
          </p>
        )}
        {selectedOwner ? (
          <p className="booking-owner-picked">
            For <strong>{selectedOwner.full_name}</strong>{' '}
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
        ) : owners.length > 0 ? (
          <div className="invoice-find-owners">
            <span>Open a new invoice for:</span>
            {owners.map((o) => (
              <button
                type="button"
                key={o.id}
                onClick={() => {
                  setSelectedOwner({ id: o.id, full_name: o.full_name });
                  setForm({ ...form, client_id: o.id, visit_id: '' });
                }}
              >
                <strong>{o.full_name}</strong>
                {o.client_number ? ` #${o.client_number}` : ''}
                {o.pets.length ? ` · ${o.pets.join(', ')}` : ''}
              </button>
            ))}
          </div>
        ) : (
          <p className="invoice-find-hint phone-hide">To open a new invoice, find the client by Client #, Patient #, Name or Phone.</p>
        )}
        {form.client_id && (
          <>
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
            <button type="submit" disabled={submitting || !form.client_id}>
              {submitting ? 'Opening...' : 'Open'}
            </button>
          </>
        )}
      </form>
      </div>
      </div>
    </div>
  );
}
