// app/_components/PreInvoiceOverview.jsx
// A live, editable preview of this admission's invoice, right on the
// hospitalization page — every billable item logged so far (including
// the automatic daily hospitalization charge, see
// lib/hospitalizationCharges.js), always in sync with the worksheet.
// Finds-or-creates the invoice and re-syncs it (POST .../invoice) on
// mount and whenever a new worksheet entry lands, so what's shown here
// never lags behind — same underlying invoice the "Invoice" button below
// opens, just editable inline instead of a click-through.
//
// Quantity edits commit on blur, no Save button — same on-blur-commit
// pattern as DayProcedureTreatmentPlan.jsx's own treatment-items-table,
// since staff make several small adjustments in a row here and a Save
// click per edit would just be friction.

'use client';

import { Fragment, useEffect, useState } from 'react';
import CatalogPicker from '@/app/_components/CatalogPicker';
import { supabase } from '@/lib/supabaseClient';
import { groupLineItemsBySection } from '@/lib/catalogGrouping';

function money(n) {
  return Number(n || 0).toFixed(2);
}

const STATUS_LABELS = { unpaid: 'unpaid', partially_paid: 'partially paid', paid: 'paid', void: 'void' };
const STATUS_DOT_CLASS = { unpaid: 'unpaid', partially_paid: 'partial', paid: 'paid', void: 'void' };

export default function PreInvoiceOverview({
  hospitalizationId,
  catalog,
  subcategories,
  onCatalogItemCreated,
  heading = '💰 Pre-Invoice Overview',
  recordHref,
  mergeTarget, // { id, label } — offers "Merge into {label}'s invoice" when set (see migration 114)
  onMerged,
}) {
  const [invoice, setInvoice] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [needsDogSize, setNeedsDogSize] = useState(false);
  const [resolvingSize, setResolvingSize] = useState(false);
  const [drafts, setDrafts] = useState({}); // line item id -> quantity while typing, before it's saved on blur
  const [removingId, setRemovingId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addGoodsServiceId, setAddGoodsServiceId] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmingMerge, setConfirmingMerge] = useState(false);
  const [merging, setMerging] = useState(false);

  async function syncAndLoad(dogSize) {
    setError(null);
    const syncRes = await fetch(`/api/hospitalizations/${hospitalizationId}/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dogSize ? { dog_size: dogSize } : {}),
    });
    const syncData = await syncRes.json();
    if (!syncRes.ok) {
      setError(syncData.error || 'Failed to sync invoice');
      setLoading(false);
      return;
    }
    setNeedsDogSize(Boolean(syncData.needs_dog_size));

    // Nothing billable logged yet — no invoice exists for this case at all
    // (see the route: it deliberately doesn't create an empty one just from
    // this panel loading), so there's nothing to fetch.
    if (!syncData.id) {
      setInvoice(null);
      setLineItems([]);
      setLoading(false);
      return;
    }

    const invRes = await fetch(`/api/invoices/${syncData.id}`);
    const invData = await invRes.json();
    if (!invRes.ok) {
      setError(invData.error || 'Failed to load invoice');
      setLoading(false);
      return;
    }
    setInvoice(invData);
    setLineItems(invData.line_items || []);
    setLoading(false);
  }

  useEffect(() => {
    syncAndLoad();
    const channel = supabase
      .channel(`pre-invoice-${hospitalizationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hospitalization_notes', filter: `hospitalization_id=eq.${hospitalizationId}` },
        () => syncAndLoad()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitalizationId]);

  // Once the invoice itself exists, also pick up edits made straight on
  // its own full page (/invoices/:id) — a payment logged there, or a line
  // someone else adjusted — without needing another worksheet entry to
  // trigger a re-sync.
  useEffect(() => {
    if (!invoice?.id) return undefined;
    const channel = supabase
      .channel(`pre-invoice-lines-${invoice.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoice_line_items', filter: `invoice_id=eq.${invoice.id}` },
        () => syncAndLoad()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id]);

  async function resolveDogSize(size) {
    setResolvingSize(true);
    await syncAndLoad(size);
    setResolvingSize(false);
  }

  function commitQuantity(item, value) {
    const quantity = Number(value);
    if (!value || Number.isNaN(quantity) || quantity <= 0 || quantity === Number(item.quantity)) {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }
    saveQuantity(item, quantity);
  }

  async function saveQuantity(item, quantity) {
    const res = await fetch(`/api/invoices/${invoice.id}/line-items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity }),
    });
    const data = await res.json();
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    if (!res.ok) {
      setError(data.error || 'Failed to update quantity');
      return;
    }
    syncAndLoad();
  }

  async function removeLine(item) {
    setRemovingId(item.id);
    const res = await fetch(`/api/invoices/${invoice.id}/line-items/${item.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    setRemovingId(null);
    if (!res.ok) {
      setError(data.error || 'Failed to remove item');
      return;
    }
    syncAndLoad();
  }

  async function addItem() {
    if (!addGoodsServiceId) return;
    setAdding(true);
    setError(null);
    const res = await fetch(`/api/invoices/${invoice.id}/line-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goods_service_id: addGoodsServiceId }),
    });
    const data = await res.json();
    setAdding(false);
    if (!res.ok) {
      setError(data.error || 'Failed to add item');
      return;
    }
    setAddGoodsServiceId('');
    setShowAdd(false);
    syncAndLoad();
  }

  async function mergeIntoTarget() {
    if (!mergeTarget) return;
    setMerging(true);
    setError(null);
    const res = await fetch(`/api/hospitalizations/${hospitalizationId}/merge-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ into: mergeTarget.id }),
    });
    const data = await res.json().catch(() => ({}));
    setMerging(false);
    setConfirmingMerge(false);
    if (!res.ok) {
      setError(data.error || 'Failed to merge invoices');
      return;
    }
    onMerged?.();
  }

  const lineItemSections = groupLineItemsBySection(lineItems);

  return (
    <div className="card pre-invoice-overview">
      <h3>
        {heading}
        {invoice?.status && (
          <span className={`status-pill ${STATUS_DOT_CLASS[invoice.status] || 'unpaid'}`}>
            {STATUS_LABELS[invoice.status] || invoice.status}
          </span>
        )}
      </h3>
      <p className="visit-meta">
        Every billable item logged on this stay — kept in sync automatically. Adjust the quantity or
        remove anything below; changes save immediately, no separate step needed.
        {recordHref && (
          <>
            {' '}
            <a href={recordHref}>Open the record →</a>
          </>
        )}
      </p>

      {error && <p className="error">{error}</p>}

      {needsDogSize && (
        <div className="pre-invoice-dog-size">
          <p>
            This dog has no weight on file yet, so the daily hospitalization charge hasn't started —
            pick a size to begin it (used for every day of this stay, once set):
          </p>
          <div className="pre-invoice-dog-size-actions">
            <button type="button" onClick={() => resolveDogSize('small')} disabled={resolvingSize}>
              Small (≤15kg)
            </button>
            <button type="button" onClick={() => resolveDogSize('large')} disabled={resolvingSize}>
              Large (&gt;15kg)
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <table className="treatment-items-table pre-invoice-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.length === 0 && (
                <tr>
                  <td colSpan={4}>Nothing billable logged yet.</td>
                </tr>
              )}
              {lineItemSections.map((section) => (
                <Fragment key={section.sectionLabel || 'primary'}>
                  {section.sectionLabel && (
                    <tr className="invoice-section-row">
                      <td colSpan={4}>{section.sectionLabel}</td>
                    </tr>
                  )}
                  {section.items.map((li) => (
                    <tr key={li.id}>
                      <td>{li.description}</td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          value={drafts[li.id] ?? li.quantity}
                          onChange={(e) => setDrafts({ ...drafts, [li.id]: e.target.value })}
                          onBlur={(e) => commitQuantity(li, e.target.value)}
                        />
                      </td>
                      <td>AED {money(li.line_total)}</td>
                      <td>
                        <button
                          type="button"
                          className="day-plan-remove"
                          style={{ position: 'static' }}
                          onClick={() => removeLine(li)}
                          disabled={removingId === li.id}
                          title="Remove from invoice"
                        >
                          &times;
                        </button>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            {invoice && (
              <tfoot>
                <tr>
                  <td colSpan={2}>Running Total</td>
                  <td colSpan={2}>AED {money(invoice.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>

          {invoice &&
            (showAdd ? (
              <div className="pre-invoice-add">
                <CatalogPicker
                  catalog={catalog}
                  subcategories={subcategories}
                  value={addGoodsServiceId}
                  onChange={setAddGoodsServiceId}
                  onItemCreated={onCatalogItemCreated}
                />
                <div className="day-plan-edit-actions">
                  <button type="button" onClick={addItem} disabled={!addGoodsServiceId || adding}>
                    {adding ? 'Adding...' : 'Add'}
                  </button>
                  <button type="button" onClick={() => setShowAdd(false)} disabled={adding}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="pill-btn" onClick={() => setShowAdd(true)} style={{ marginTop: '0.7rem' }}>
                + Add Item
              </button>
            ))}

          {invoice && mergeTarget && (
            <div className="pre-invoice-merge">
              {confirmingMerge ? (
                <p className="invoice-void-confirm">
                  Consolidate this onto {mergeTarget.label}&rsquo;s invoice? This can&rsquo;t be undone.{' '}
                  <button type="button" onClick={mergeIntoTarget} disabled={merging}>
                    {merging ? 'Merging...' : 'Yes, merge it'}
                  </button>{' '}
                  <button type="button" onClick={() => setConfirmingMerge(false)} disabled={merging}>
                    Cancel
                  </button>
                </p>
              ) : (
                <button type="button" className="pill-btn" onClick={() => setConfirmingMerge(true)}>
                  Merge into {mergeTarget.label}&rsquo;s invoice
                </button>
              )}
            </div>
          )}

          {invoice && (
            <p className="visit-meta pre-invoice-open-link">
              <a href={`/invoices/${invoice.id}`}>Open full invoice →</a>
            </p>
          )}
        </>
      )}
    </div>
  );
}
