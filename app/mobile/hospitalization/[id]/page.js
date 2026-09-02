// app/mobile/hospitalization/[id]/page.js
// Record a hospitalization worksheet entry from a phone. A worksheet
// entry doesn't exist as a row until submitted — same as the desktop
// "Add Worksheet Entry" card — so recording fills in this page's own
// draft fields (and pending items list) rather than writing directly to
// the database; tap Save Entry to actually log it. Trimmed down from the
// desktop card: no author picker, no consent forms, no invoice section —
// just record, check the boxes look right, save.

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AudioRecorder from '@/app/_components/AudioRecorder';
import CatalogPicker from '@/app/_components/CatalogPicker';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm = {
  note_date: todayISODate(),
  appetite: '',
  condition: '',
  temperature_c: '',
  weight_kg: '',
  notes: '',
};

const emptyPendingItem = { goods_service_id: '', instructions: '', quantity: '1' };

export default function MobileHospitalizationPage() {
  const { id } = useParams();
  const router = useRouter();
  const [admission, setAdmission] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [pendingItems, setPendingItems] = useState([]);
  const [pendingItemForm, setPendingItemForm] = useState(emptyPendingItem);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/hospitalizations/${id}`)
      .then((res) => res.json())
      .then(setAdmission);
    fetch('/api/goods-services?active=true')
      .then((res) => res.json())
      .then((data) => setCatalog(Array.isArray(data) ? data : []));
    fetch('/api/catalog-subcategories')
      .then((res) => res.json())
      .then((data) => setSubcategories(Array.isArray(data) ? data : []));
  }, [id]);

  // Same merge rules as the desktop card: appetite/weight/temperature/
  // condition only fill in if still empty (no sensible way to "append" to
  // a select or a number), notes appends, matched items join the pending
  // list as if "+ Add Item" had been tapped for each.
  function applyExtractedFields(fields) {
    setForm((prev) => {
      const next = { ...prev };
      if (fields.appetite && !next.appetite) next.appetite = fields.appetite;
      if (fields.weight_kg != null && !next.weight_kg) next.weight_kg = fields.weight_kg;
      if (fields.temperature_c != null && !next.temperature_c) next.temperature_c = fields.temperature_c;
      if (fields.condition && !next.condition) next.condition = fields.condition;
      if (fields.notes) {
        const stamp = `[AI recording, ${new Date().toLocaleString()}]`;
        next.notes = next.notes ? `${next.notes}\n\n${stamp}\n${fields.notes}` : fields.notes;
      }
      return next;
    });

    if (fields.items?.length) {
      setPendingItems((prev) => [
        ...prev,
        ...fields.items.map((item) => ({
          goods_service_id: item.goods_service_id,
          instructions: item.instructions || '',
          quantity: item.quantity || 1,
          name: item.name,
        })),
      ]);
    }
    setSaved(false);
  }

  function addPendingItem() {
    if (!pendingItemForm.goods_service_id) return;
    const catalogItem = catalog.find((c) => c.id === pendingItemForm.goods_service_id);
    setPendingItems((prev) => [...prev, { ...pendingItemForm, name: catalogItem?.name }]);
    setPendingItemForm(emptyPendingItem);
  }

  function removePendingItem(index) {
    setPendingItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveEntry(e) {
    e.preventDefault();
    setSubmitting(true);
    await fetch(`/api/hospitalizations/${id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, treatment_items: pendingItems }),
    });
    setForm({ ...emptyForm, note_date: todayISODate() });
    setPendingItems([]);
    setSubmitting(false);
    setSaved(true);
  }

  return (
    <div className="mobile-page">
      <a href="/mobile/hospitalization" className="mobile-back">
        &larr; Hospitalization
      </a>
      {admission && (
        <>
          <h1>{admission.cages?.name || 'No cage'} — {admission.patients?.name}</h1>
          <p className="mobile-subtitle">{admission.clients?.full_name}</p>
          <p className="mobile-hint">
            Record an observation and it'll fill in Appetite, Weight, Temperature, Condition, and
            Notes below, plus match any medications/tests you mention against the catalog. Check
            it over, then tap Save Entry.
          </p>
          <AudioRecorder entityType="hospitalization" entityId={id} onExtractedFields={applyExtractedFields} />

          <form className="card mobile-worksheet-form" onSubmit={saveEntry}>
            {saved && <p className="mobile-saved">Entry saved.</p>}
            <select value={form.appetite} onChange={(e) => setForm({ ...form, appetite: e.target.value })}>
              <option value="">Appetite...</option>
              <option value="good">Good</option>
              <option value="reduced">Reduced</option>
              <option value="none">None</option>
            </select>
            <input
              type="number"
              step="0.01"
              placeholder="Weight (kg)"
              value={form.weight_kg}
              onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
            />
            <input
              type="number"
              step="0.1"
              placeholder="Temperature (°C)"
              value={form.temperature_c}
              onChange={(e) => setForm({ ...form, temperature_c: e.target.value })}
            />
            <input
              placeholder="General condition"
              value={form.condition}
              onChange={(e) => setForm({ ...form, condition: e.target.value })}
            />
            <textarea
              rows={3}
              placeholder="Notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />

            <fieldset className="pending-items">
              <legend>Medications / Goods / Services given</legend>
              {pendingItems.length > 0 && (
                <ul className="pending-items-list">
                  {pendingItems.map((p, i) => (
                    <li key={i}>
                      {p.name}
                      {p.quantity > 1 ? ` ×${p.quantity}` : ''}
                      {p.instructions && ` — ${p.instructions}`}
                      <button type="button" onClick={() => removePendingItem(i)}>
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <CatalogPicker
                catalog={catalog}
                subcategories={subcategories}
                value={pendingItemForm.goods_service_id}
                onChange={(value) => setPendingItemForm({ ...pendingItemForm, goods_service_id: value })}
                onItemCreated={(item) => setCatalog((prev) => [...prev, item])}
              />
              <input
                placeholder="Instructions"
                value={pendingItemForm.instructions}
                onChange={(e) => setPendingItemForm({ ...pendingItemForm, instructions: e.target.value })}
              />
              <input
                type="number"
                step="0.01"
                placeholder="Quantity"
                value={pendingItemForm.quantity}
                onChange={(e) => setPendingItemForm({ ...pendingItemForm, quantity: e.target.value })}
              />
              <button type="button" className="secondary" onClick={addPendingItem}>
                + Add Item
              </button>
            </fieldset>

            <button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Entry'}
            </button>
          </form>

          <button type="button" className="mobile-secondary-action" onClick={() => router.push('/mobile/hospitalization')}>
            Done
          </button>
        </>
      )}
    </div>
  );
}
