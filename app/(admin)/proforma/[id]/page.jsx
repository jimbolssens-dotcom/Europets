// app/proforma/[id]/page.jsx
// A single proforma invoice (quote): patient/client context, line items,
// VAT estimate, add-item form, and Download/WhatsApp/Email quote actions —
// no payments, no status, nothing here ever reaches accounting (see
// migrations/101_proforma_invoices.sql). Reachable from the patient page's
// "Create Proforma Invoice" button and its list of past quotes.

'use client';

import { Fragment, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import CatalogPicker from '@/app/_components/CatalogPicker';
import { groupLineItemsByCategory } from '@/lib/catalogGrouping';
import { ADMINISTRATION_METHOD_LABELS } from '@/lib/administrationMethods';
import { openWhatsApp } from '@/lib/whatsapp';

function money(n) {
  return Number(n || 0).toFixed(2);
}

const VAT_RATE = 0.05;

export default function ProformaInvoiceDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [goodsServiceId, setGoodsServiceId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [shareError, setShareError] = useState(null);
  const [discarding, setDiscarding] = useState(false);
  const [quantityDrafts, setQuantityDrafts] = useState({});

  const loadQuote = () =>
    fetch(`/api/proforma-invoices/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setQuote(data);
        setLoading(false);
      });

  useEffect(() => {
    loadQuote();
    fetch('/api/goods-services?active=true')
      .then((res) => res.json())
      .then((data) => setCatalog(Array.isArray(data) ? data : []));
    fetch('/api/catalog-subcategories')
      .then((res) => res.json())
      .then((data) => setSubcategories(Array.isArray(data) ? data : []));

    const channel = supabase
      .channel(`proforma-detail-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proforma_invoice_items', filter: `proforma_invoice_id=eq.${id}` }, () => loadQuote())
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function addItem(e) {
    e.preventDefault();
    if (!goodsServiceId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/proforma-invoices/${id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goods_service_id: goodsServiceId, quantity: quantity ? Number(quantity) : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add item');
      setGoodsServiceId('');
      setQuantity('');
      loadQuote();
    } catch (err) {
      setError(err.message);
    }
    setSubmitting(false);
  }

  async function removeItem(itemId) {
    setError(null);
    const res = await fetch(`/api/proforma-invoices/${id}/items/${itemId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Failed to remove item');
      return;
    }
    loadQuote();
  }

  function commitQuantity(item, value) {
    const newQuantity = Number(value);
    if (!value || Number.isNaN(newQuantity) || newQuantity <= 0 || newQuantity === Number(item.quantity)) {
      setQuantityDrafts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }
    fetch(`/api/proforma-invoices/${id}/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: newQuantity }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data.error || 'Failed to update quantity');
          return;
        }
        setQuantityDrafts((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
        loadQuote();
      });
  }

  async function discardQuote() {
    if (!confirm('Discard this quote? This cannot be undone.')) return;
    setDiscarding(true);
    const res = await fetch(`/api/proforma-invoices/${id}`, { method: 'DELETE' });
    setDiscarding(false);
    if (res.ok) router.push(`/patients/${quote.patient_id}`);
  }

  function downloadQuote() {
    window.open(`/api/proforma-invoices/${id}/quote-pdf?t=${Date.now()}`, '_blank');
  }

  function sendViaWhatsApp() {
    setShareError(null);
    const url = `${window.location.origin}/api/proforma-invoices/${id}/quote-pdf`;
    const message = `Hi ${quote.clients?.full_name || ''}! Here is a quotation from Europets Clinic for ${quote.patients?.name || 'your pet'}: ${url}`;
    const digits = (quote.clients?.phone || '').replace(/\D/g, '');
    if (digits.length > 3) {
      openWhatsApp(quote.clients?.phone, message);
    } else {
      navigator.clipboard.writeText(url);
      setShareError('No phone number on file — link copied to clipboard instead.');
    }
  }

  function sendViaEmail() {
    setShareError(null);
    if (!quote.clients?.email) {
      setShareError('No email address on file for this client.');
      return;
    }
    const url = `${window.location.origin}/api/proforma-invoices/${id}/quote-pdf`;
    const subject = `Europets Clinic — Quotation for ${quote.patients?.name || 'your pet'}`;
    const body = `Hi ${quote.clients?.full_name || ''},\n\nHere is a quotation from Europets Clinic: ${url}\n\nThis is an estimate only — please don't hesitate to reach out if you have any questions.`;
    window.open(`mailto:${quote.clients.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
  }

  if (loading || !quote) return <p>Loading quote...</p>;
  if (quote.error) return <p>Quote not found.</p>;

  const selected = catalog.find((c) => c.id === goodsServiceId);
  const items = quote.items || [];
  const lineItemGroups = groupLineItemsByCategory(items);
  const subtotal = items.reduce((sum, item) => sum + Number(item.line_total), 0);
  const vatAmount = Math.round(subtotal * VAT_RATE * 100) / 100;
  const total = Math.round((subtotal + vatAmount) * 100) / 100;
  const columnCount = 6;

  return (
    <div>
      <p>
        <a href={`/patients/${quote.patient_id}`}>&larr; Back to {quote.patients?.name || 'patient'}</a>
      </p>
      <h1>
        Quotation — {quote.patients?.name} — {quote.clients?.full_name} <span>(not a tax invoice)</span>
      </h1>
      <p className="visit-meta">
        {quote.clients?.phone} · {quote.clients?.email}
      </p>
      <p className="visit-meta">Created: {new Date(quote.created_at).toLocaleDateString()}</p>

      <div className="action-row">
        <button type="button" onClick={downloadQuote}>
          📄 Download
        </button>
        <button type="button" onClick={sendViaWhatsApp}>
          💬 WhatsApp
        </button>
        <button type="button" onClick={sendViaEmail}>
          ✉️ Email
        </button>
        <button type="button" onClick={discardQuote} disabled={discarding}>
          {discarding ? 'Discarding…' : '🗑️ Discard Quote'}
        </button>
      </div>
      {shareError && <p className="error">{shareError}</p>}
      {error && <p className="error">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Method</th>
            <th>Unit price</th>
            <th>Line total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lineItemGroups.map((group) => (
            <Fragment key={group.mainCategory || 'other'}>
              <tr className="invoice-category-row">
                <td colSpan={columnCount}>{group.label}</td>
              </tr>
              {group.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      className="qty-input"
                      value={quantityDrafts[item.id] ?? item.quantity}
                      onChange={(e) => setQuantityDrafts({ ...quantityDrafts, [item.id]: e.target.value })}
                      onBlur={(e) => commitQuantity(item, e.target.value)}
                    />
                  </td>
                  <td>{item.administration_method ? ADMINISTRATION_METHOD_LABELS[item.administration_method] : '—'}</td>
                  <td>{money(item.unit_price)}</td>
                  <td>{money(item.line_total)}</td>
                  <td>
                    <button type="button" onClick={() => removeItem(item.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={columnCount}>No items on this quote yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      <p>
        Subtotal: {money(subtotal)} · VAT (5%): {money(vatAmount)} · <strong>Estimated Total: {money(total)}</strong>
      </p>

      <form className="note-form catalog-add-form" onSubmit={addItem}>
        <CatalogPicker
          catalog={catalog}
          subcategories={subcategories}
          value={goodsServiceId}
          onChange={setGoodsServiceId}
          onItemCreated={(item) => setCatalog((prev) => [...prev, item])}
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
    </div>
  );
}
