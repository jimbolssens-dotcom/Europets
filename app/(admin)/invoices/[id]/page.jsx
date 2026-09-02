// app/invoices/[id]/page.jsx
// A single invoice: client/consult context, line items, VAT breakdown,
// add-item form, and status controls. Reachable from the invoices list or
// directly from a consult ("View Invoice" once one's been created for it).

'use client';

import { Fragment, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import CatalogPicker from '@/app/_components/CatalogPicker';
import { groupLineItemsByCategory } from '@/lib/catalogGrouping';

function money(n) {
  return Number(n || 0).toFixed(2);
}

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [goodsServiceId, setGoodsServiceId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const loadInvoice = () =>
    fetch(`/api/invoices/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setInvoice(data);
        setLoading(false);
      });

  useEffect(() => {
    loadInvoice();
    fetch('/api/goods-services?active=true')
      .then((res) => res.json())
      .then((data) => setCatalog(Array.isArray(data) ? data : []));
    fetch('/api/catalog-subcategories')
      .then((res) => res.json())
      .then((data) => setSubcategories(Array.isArray(data) ? data : []));

    const channel = supabase
      .channel(`invoice-detail-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoice_line_items', filter: `invoice_id=eq.${id}` },
        () => loadInvoice()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoices', filter: `id=eq.${id}` },
        () => loadInvoice()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function addLineItem(e) {
    e.preventDefault();
    if (!goodsServiceId) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/invoices/${id}/line-items`, {
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
    await fetch(`/api/invoices/${id}/line-items/${itemId}`, { method: 'DELETE' });
    loadInvoice();
  }

  async function setStatus(status) {
    await fetch(`/api/invoices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    loadInvoice();
  }

  function downloadTaxInvoice() {
    // A cache-busting query param, on top of the route's own no-store
    // headers, so a browser/download manager can never reuse a previous
    // download of this same invoice after it's been edited.
    window.open(`/api/invoices/${id}/tax-invoice-pdf?t=${Date.now()}`, '_blank');
  }

  if (loading || !invoice) return <p>Loading invoice...</p>;
  if (invoice.error) return <p>Invoice not found.</p>;

  const selected = catalog.find((c) => c.id === goodsServiceId);
  const patientName = invoice.visits?.patients?.name || invoice.hospitalizations?.patients?.name;
  const lineItemGroups = groupLineItemsByCategory(invoice.line_items);
  const columnCount = invoice.status === 'unpaid' ? 5 : 4;

  return (
    <div>
      <p>
        <a href="/invoices">&larr; All invoices</a>
      </p>
      <h1>
        Invoice {invoice.invoice_number ? `#INV-${String(invoice.invoice_number).padStart(6, '0')}` : ''} —{' '}
        {invoice.clients?.full_name}
        {patientName ? ` — ${patientName}` : ''} <span>({invoice.status})</span>
      </h1>
      <p className="visit-meta">
        {invoice.clients?.phone} · {invoice.clients?.email}
        {invoice.visit_id && (
          <>
            {' · '}
            <a href={`/consults/${invoice.visit_id}`}>View originating consult</a>
          </>
        )}
      </p>
      <p>
        <button type="button" onClick={downloadTaxInvoice}>
          📄 Download Tax Invoice (PDF)
        </button>
      </p>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>Line total</th>
            {invoice.status === 'unpaid' && <th></th>}
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
                  {invoice.status === 'unpaid' && (
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
        Subtotal: {money(invoice.subtotal)} · VAT (5%): {money(invoice.vat_amount)} ·{' '}
        <strong>Total: {money(invoice.total)}</strong>
      </p>

      {invoice.status === 'unpaid' && (
        <>
          <form className="note-form catalog-add-form" onSubmit={addLineItem}>
            {error && <p className="error">{error}</p>}
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
                Add
              </button>
            </div>
          </form>
          <div className="home-links" style={{ marginTop: '0.75rem' }}>
            <button type="button" onClick={() => setStatus('paid')}>
              Mark Paid
            </button>
            <button type="button" onClick={() => setStatus('void')}>
              Void
            </button>
          </div>
        </>
      )}
    </div>
  );
}
