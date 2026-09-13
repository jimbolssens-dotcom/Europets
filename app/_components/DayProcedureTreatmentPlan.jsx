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

'use client';

import { useEffect, useState } from 'react';
import CatalogPicker from '@/app/_components/CatalogPicker';
import VoiceToTextButton from '@/app/_components/VoiceToTextButton';
import { ADMINISTRATION_METHOD_LABELS } from '@/lib/administrationMethods';
import { subcategoryName } from '@/lib/catalogGrouping';
import { supabase } from '@/lib/supabaseClient';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default function DayProcedureTreatmentPlan({ hospitalizationId, catalog, subcategories, onCatalogItemCreated }) {
  const [treatmentItems, setTreatmentItems] = useState([]);
  const [treatForm, setTreatForm] = useState({ goods_service_id: '', instructions: '', quantity: '1' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

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
        }],
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error || 'Failed to add item');
      return;
    }
    setTreatForm({ goods_service_id: '', instructions: '', quantity: '1' });
    loadTreatmentItems();
  }

  async function deleteTreatmentItem(itemId) {
    await fetch(`/api/treatment-items/${itemId}`, { method: 'DELETE' });
    loadTreatmentItems();
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
        <button type="submit" disabled={submitting}>
          {submitting ? 'Adding...' : '+ Add'}
        </button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Instructions</th>
            <th>Qty</th>
            <th>Given</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {treatmentItems.length === 0 && (
            <tr>
              <td colSpan={5}>No treatment items yet.</td>
            </tr>
          )}
          {treatmentItems.map((t) => (
            <tr key={t.id}>
              <td>
                {t.goods_services?.name}
                {subcategoryName(subcategories, t.goods_services?.subcategory_id) &&
                  ` (${subcategoryName(subcategories, t.goods_services?.subcategory_id)})`}
              </td>
              <td>{t.instructions}</td>
              <td>{t.quantity}</td>
              <td>{t.administration_method ? ADMINISTRATION_METHOD_LABELS[t.administration_method] : '—'}</td>
              <td>
                <button type="button" onClick={() => deleteTreatmentItem(t.id)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
