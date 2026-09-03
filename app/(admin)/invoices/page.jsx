// app/invoices/page.jsx
// Invoice list + builder. Each invoice card fetches its own line items and
// stays live via realtime, so totals update immediately as items are added
// or removed on any terminal. VAT is UAE standard 5%, computed server-side.

'use client';

import { Fragment, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import CatalogPicker from '@/app/_components/CatalogPicker';
import SearchSelect from '@/app/_components/SearchSelect';
import InvoicePaymentPanel from '@/app/_components/InvoicePaymentPanel';
import { groupLineItemsByCategory } from '@/lib/catalogGrouping';

function money(n) {
  return Number(n || 0).toFixed(2);
}

const STATUS_LABELS = {
  unpaid: 'unpaid',
  partially_paid: 'partially paid',
  paid: 'paid',
  void: 'void',
};

function InvoiceCard({ summary, catalog, subcategories, staff, onCatalogChange, onChanged }) {
  const [invoice, setInvoice] = useState(null);
  const [goodsServiceId, setGoodsServiceId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const loadInvoice = () =>
    fetch(`/api/invoices/${summary.id}`)
      .then((res) => res.json())
      .then(setInvoice);

  useEffect(() => {
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
  }, [summary.id]);

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

  if (!invoice) return null;

  const selected = catalog.find((c) => c.id === goodsServiceId);
  const patientName = invoice.visits?.patients?.name || invoice.hospitalizations?.patients?.name;
  const lineItemGroups = groupLineItemsByCategory(invoice.line_items);
  const editable = invoice.status === 'unpaid' || invoice.status === 'partially_paid';
  const columnCount = editable ? 5 : 4;

  return (
    <div className="visit-card">
      <div className="visit-header">
        <div>
          {invoice.invoice_number && (
            <span className="visit-meta">INV-{String(invoice.invoice_number).padStart(6, '0')} · </span>
          )}
          <strong>
            <a href={`/invoices/${summary.id}`}>{invoice.clients?.full_name}</a>
          </strong>
          {patientName ? ` — ${patientName}` : ''}
        </div>
        <span>{STATUS_LABELS[invoice.status] || invoice.status}</span>
      </div>

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
        Subtotal: {money(invoice.subtotal)} · VAT (5%): {money(invoice.vat_amount)} · <strong>Total: {money(invoice.total)}</strong>
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
      )}

      <InvoicePaymentPanel
        invoice={invoice}
        staff={staff}
        onChanged={() => {
          loadInvoice();
          onChanged();
        }}
      />
    </div>
  );
}

const emptyForm = { client_id: '', visit_id: '' };

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [visits, setVisits] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('unpaid,partially_paid');

  const loadInvoices = (status) =>
    fetch(`/api/invoices${status ? `?status=${status}` : ''}`)
      .then((res) => res.json())
      .then((data) => {
        setInvoices(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    setLoading(true);
    loadInvoices(statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    Promise.all([
      fetch('/api/clients').then((res) => res.json()),
      fetch('/api/visits').then((res) => res.json()),
      fetch('/api/goods-services?active=true').then((res) => res.json()),
      fetch('/api/catalog-subcategories').then((res) => res.json()),
      fetch('/api/staff').then((res) => res.json()),
    ]).then(([clientsData, visitsData, catalogData, subcategoriesData, staffData]) => {
      setClients(Array.isArray(clientsData) ? clientsData : []);
      setVisits(Array.isArray(visitsData) ? visitsData : []);
      setCatalog(Array.isArray(catalogData) ? catalogData : []);
      setSubcategories(Array.isArray(subcategoriesData) ? subcategoriesData : []);
      setStaff(Array.isArray(staffData) ? staffData : []);
    });
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
        </select>
      </label>

      {loading ? (
        <p>Loading invoices...</p>
      ) : invoices.length === 0 ? (
        <p>No invoices in this view.</p>
      ) : (
        <div className="visit-board">
          {invoices.map((inv) => (
            <InvoiceCard
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
      <form className="card" onSubmit={handleSubmit}>
        <h2>Open Invoice</h2>
        {error && <p className="error">{error}</p>}
        <SearchSelect
          items={clients}
          value={form.client_id}
          onChange={(client_id) => setForm({ ...form, client_id, visit_id: '' })}
          getLabel={(c) => c.full_name}
          getSubLabel={(c) => c.phone}
          placeholder="Select client..."
        />
        <select
          disabled={!form.client_id}
          value={form.visit_id}
          onChange={(e) => setForm({ ...form, visit_id: e.target.value })}
        >
          <option value="">Link to a visit (optional)...</option>
          {visitsForClient.map((v) => (
            <option key={v.id} value={v.id}>
              {v.patients?.name} — {new Date(v.started_at).toLocaleString()}
            </option>
          ))}
        </select>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Opening...' : 'Open Invoice'}
        </button>
      </form>
      </div>
      </div>
    </div>
  );
}
