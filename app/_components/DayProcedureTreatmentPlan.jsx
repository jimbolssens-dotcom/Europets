// app/_components/DayProcedureTreatmentPlan.jsx
// The day procedure page's third column — add an arbitrary product/test/
// service straight to the invoice, same as the consult page's own
// Treatment Plan block, rather than only what the Procedure Checklist
// happens to have on it. There's no hospitalization_id column on
// treatment_items (see app/api/treatment-items/route.js) — every item is
// attached to a hospitalization_notes row — so adding one here quietly
// creates a blank, textless note to hang it on. That note is invisible
// elsewhere: DayProcedureNotes filters out anything with no plan_item_ids
// AND no notes text, and ProcedureChecklist only shows notes that DO have
// plan_item_ids — so this never shows up as a stray empty note, only as a
// line here and on the invoice.
//
// The list itself matches the consult page's Treatment Plan table exactly
// (same .treatment-items-table styling and on-blur-commit editing) —
// Instructions/Qty/Given adjustable straight from the list, a Don't
// charge checkbox, and a compact × remove button — so items landing here
// from the Procedure Checklist can be corrected the same way a dictated
// consult item can.

'use client';

import { useEffect, useState } from 'react';
import CatalogPicker from '@/app/_components/CatalogPicker';
import VoiceToTextButton from '@/app/_components/VoiceToTextButton';
import { ADMINISTRATION_METHOD_LABELS, ADMINISTRATION_METHOD_CODES } from '@/lib/administrationMethods';
import { subcategoryName } from '@/lib/catalogGrouping';
import { supabase } from '@/lib/supabaseClient';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default function DayProcedureTreatmentPlan({ hospitalizationId, catalog, subcategories, onCatalogItemCreated }) {
  const [treatmentItems, setTreatmentItems] = useState([]);
  const [treatForm, setTreatForm] = useState({ goods_service_id: '', instructions: '', quantity: '1', billable: true });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [treatItemDrafts, setTreatItemDrafts] = useState({}); // item id -> { quantity, instructions } while typing, before it's saved on blur

  function loadTreatmentItems() {
    fetch(`/api/hospitalizations/${hospitalizationId}/notes`)
      .then((res) => res.json())
      .then((data) => {
        const items = (Array.isArray(data) ? data : [])
          .flatMap((n) => n.treatment_items || [])
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        setTreatmentItems(items);
      });
  }

  useEffect(() => {
    loadTreatmentItems();
    const channel = supabase
      .channel(`day-procedure-treatment-plan-${hospitalizationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hospitalization_notes', filter: `hospitalization_id=eq.${hospitalizationId}` },
        loadTreatmentItems
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitalizationId]);

  function appendInstructions(text) {
    setTreatForm((prev) => ({ ...prev, instructions: prev.instructions ? `${prev.instructions}\n${text}` : text }));
  }

  async function addTreatmentItem(e) {
    e.preventDefault();
    if (!treatForm.goods_service_id) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/hospitalizations/${hospitalizationId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        note_date: todayISODate(),
        treatment_items: [{
          goods_service_id: treatForm.goods_service_id,
          instructions: treatForm.instructions,
          quantity: treatForm.quantity,
          billable: treatForm.billable,
        }],
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error || 'Failed to add item');
      return;
    }
    setTreatForm({ goods_service_id: '', instructions: '', quantity: '1', billable: true });
    loadTreatmentItems();
  }

  async function deleteTreatmentItem(itemId) {
    await fetch(`/api/treatment-items/${itemId}`, { method: 'DELETE' });
    loadTreatmentItems();
  }

  // Toggled straight from the list — especially needed for an item that
  // landed here from the Procedure Checklist, which never went through
  // the add form's own checkbox in the first place.
  async function toggleTreatmentItemBillable(item) {
    await fetch(`/api/treatment-items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billable: item.billable === false }),
    });
    loadTreatmentItems();
  }

  // Quantity/instructions/administration_method are all correctable
  // straight from the list — same on-blur-commit pattern as the consult
  // page's own Treatment Plan list and the invoice page's line items.
  async function saveTreatmentItemField(itemId, patch) {
    const res = await fetch(`/api/treatment-items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to save changes');
    }
    setTreatItemDrafts((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    loadTreatmentItems();
  }

  function commitTreatmentItemQuantity(item, value) {
    const quantity = Number(value);
    if (!value || Number.isNaN(quantity) || quantity <= 0 || quantity === Number(item.quantity)) {
      setTreatItemDrafts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }
    saveTreatmentItemField(item.id, { quantity });
  }

  function commitTreatmentItemInstructions(item, value) {
    if (value === (item.instructions || '')) {
      setTreatItemDrafts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }
    saveTreatmentItemField(item.id, { instructions: value });
  }

  function changeTreatmentItemMethod(item, value) {
    saveTreatmentItemField(item.id, { administration_method: value || null });
  }

  return (
    <div>
      <h3>Treatment Plan</h3>
      <form className="card" onSubmit={addTreatmentItem}>
        {error && <p className="error">{error}</p>}
        <CatalogPicker
          catalog={catalog}
          subcategories={subcategories}
          value={treatForm.goods_service_id}
          onChange={(value) => setTreatForm({ ...treatForm, goods_service_id: value })}
          onItemCreated={onCatalogItemCreated}
        />
        <div className="instructions-input-row">
          <input
            placeholder="Instructions (dosage, frequency, duration)"
            value={treatForm.instructions}
            onChange={(e) => setTreatForm({ ...treatForm, instructions: e.target.value })}
          />
          <VoiceToTextButton kind="treatment_item_instructions" onResult={appendInstructions} />
        </div>
        <input
          type="number"
          step="0.01"
          placeholder="Quantity"
          value={treatForm.quantity}
          onChange={(e) => setTreatForm({ ...treatForm, quantity: e.target.value })}
        />
        <label className="treat-item-billable-toggle">
          <input
            type="checkbox"
            checked={!treatForm.billable}
            onChange={(e) => setTreatForm({ ...treatForm, billable: !e.target.checked })}
          />
          Don't charge to invoice — owner already has this
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Adding...' : '+ Add'}
        </button>
      </form>

      <div className="table-wrap">
      <table className="treatment-items-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Instructions</th>
            <th>Qty</th>
            <th>Given</th>
            <th>Don't charge</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {treatmentItems.length === 0 && (
            <tr>
              <td colSpan={6}>No treatment items yet.</td>
            </tr>
          )}
          {treatmentItems.map((t) => {
            const draft = treatItemDrafts[t.id];
            return (
            <tr key={t.id}>
              <td>
                {t.goods_services?.name}
                {subcategoryName(subcategories, t.goods_services?.subcategory_id) &&
                  ` (${subcategoryName(subcategories, t.goods_services?.subcategory_id)})`}
              </td>
              <td>
                <input
                  value={draft?.instructions ?? (t.instructions || '')}
                  onChange={(e) =>
                    setTreatItemDrafts({ ...treatItemDrafts, [t.id]: { ...draft, instructions: e.target.value } })
                  }
                  onBlur={(e) => commitTreatmentItemInstructions(t, e.target.value)}
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  value={draft?.quantity ?? t.quantity}
                  onChange={(e) =>
                    setTreatItemDrafts({ ...treatItemDrafts, [t.id]: { ...draft, quantity: e.target.value } })
                  }
                  onBlur={(e) => commitTreatmentItemQuantity(t, e.target.value)}
                />
              </td>
              <td>
                <select
                  value={t.administration_method || ''}
                  onChange={(e) => changeTreatmentItemMethod(t, e.target.value)}
                  title={t.administration_method ? ADMINISTRATION_METHOD_LABELS[t.administration_method] : 'Not a medication'}
                >
                  <option value="">—</option>
                  <option value="dispense">{ADMINISTRATION_METHOD_CODES.dispense}</option>
                  <option value="sc">{ADMINISTRATION_METHOD_CODES.sc}</option>
                  <option value="im">{ADMINISTRATION_METHOD_CODES.im}</option>
                </select>
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={t.billable === false}
                  onChange={() => toggleTreatmentItemBillable(t)}
                  title={t.billable === false ? 'Not charged — owner already has this' : 'Charged to invoice'}
                />
              </td>
              <td>
                <button
                  type="button"
                  className="treatment-item-remove"
                  onClick={() => deleteTreatmentItem(t.id)}
                  title="Remove from treatment plan"
                >
                  &times;
                </button>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
