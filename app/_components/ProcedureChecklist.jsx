// app/_components/ProcedureChecklist.jsx
// A day procedure's checklist — dictated once (or added from the catalog)
// and matched against the service catalog, same underlying mechanism as
// DayTreatmentPlan's Day Treatment Plan (same hospitalization_plan_items
// API, same tap-to-log-a-worksheet-entry behavior so it still reaches the
// invoice) but restyled for a single same-day visit rather than a
// multi-day stay: no "today" framing, no Cage Cleaned/Walked-style
// recurring-care chips, and each row links straight to whichever report
// or input it belongs to (Dental/Surgical/X-ray/Ultrasound report,
// Vaccination, or Test Results) so nothing needs to be found separately —
// see the Day Procedure Report section below this on the page.

'use client';

import { useEffect, useRef, useState } from 'react';
import AudioRecorder from '@/app/_components/AudioRecorder';
import CatalogPicker from '@/app/_components/CatalogPicker';
import AdministrationRoutePicker from '@/app/_components/AdministrationRoutePicker';
import { ADMINISTRATION_METHOD_LABELS } from '@/lib/administrationMethods';
import { isDentalProduct } from '@/lib/dentalProduct';
import { isSpayNeuterProduct } from '@/lib/spayNeuterProduct';
import { isVaccineProduct } from '@/lib/vaccineProduct';
import { isXrayTest } from '@/lib/xrayProduct';
import { isUltrasoundTest } from '@/lib/ultrasoundProduct';
import { supabase } from '@/lib/supabaseClient';

const MOBILE_STAFF_STORAGE_KEY = 'europets_mobile_staff_id';
const CONSOLIDATE_WINDOW_MS = 5 * 60 * 1000;

// Which report/input a checklist item's link should jump to, based on the
// matched catalog item's name (falling back to the dictated label when
// there's no catalog match) — mirrors the same name-matching already used
// to fold consent language in (lib/consentTemplates.js).
function checklistLink(item, catalog) {
  const catalogItem = catalog.find((c) => c.id === item.goods_service_id);
  const name = catalogItem?.name || item.label || '';
  if (isDentalProduct(name)) return { href: '#report-dental', label: 'Open Dental Report' };
  if (isSpayNeuterProduct(name)) return { href: '#report-surgical', label: 'Open Surgical Report' };
  if (isXrayTest(name)) return { href: '#report-xray', label: 'Open X-ray Report' };
  if (isUltrasoundTest(name)) return { href: '#report-ultrasound', label: 'Open Ultrasound Report' };
  if (isVaccineProduct(name)) return { href: '#vaccination', label: 'Open Vaccination' };
  if (catalogItem?.main_category === 'test') return { href: '#report-test-results', label: 'Enter Test Result' };
  return null;
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default function ProcedureChecklist({ hospitalizationId, staff = [], catalog, subcategories, onCatalogItemCreated }) {
  const [planItems, setPlanItems] = useState([]);
  const [loggedNotes, setLoggedNotes] = useState([]);
  const [authorId, setAuthorId] = useState('');
  const [loggingId, setLoggingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [showCatalogAdd, setShowCatalogAdd] = useState(false);
  const [catalogGoodsServiceId, setCatalogGoodsServiceId] = useState('');
  const [catalogInstructions, setCatalogInstructions] = useState('');
  const [catalogAdministrationMethod, setCatalogAdministrationMethod] = useState('');
  const [showCustomAdd, setShowCustomAdd] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [error, setError] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editGoodsServiceId, setEditGoodsServiceId] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [editAdministrationMethod, setEditAdministrationMethod] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const longPressTimer = useRef(null);
  const longPressFired = useRef(false);
  const lastNoteRef = useRef(null);

  function loadPlanItems() {
    fetch(`/api/hospitalizations/${hospitalizationId}/plan-items`)
      .then((res) => res.json())
      .then((data) => setPlanItems(Array.isArray(data) ? data : []));
  }

  function loadLoggedNotes() {
    fetch(`/api/hospitalizations/${hospitalizationId}/notes`)
      .then((res) => res.json())
      .then((data) => setLoggedNotes(Array.isArray(data) ? data.filter((n) => n.plan_item_ids?.length > 0) : []));
  }

  useEffect(() => {
    loadPlanItems();
    loadLoggedNotes();
    lastNoteRef.current = null;
    const remembered = localStorage.getItem(MOBILE_STAFF_STORAGE_KEY);
    if (remembered) setAuthorId(remembered);

    const channel = supabase
      .channel(`procedure-checklist-${hospitalizationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hospitalization_plan_items', filter: `hospitalization_id=eq.${hospitalizationId}` },
        loadPlanItems
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hospitalization_notes', filter: `hospitalization_id=eq.${hospitalizationId}` },
        loadLoggedNotes
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitalizationId]);

  function handleAuthorChange(value) {
    setAuthorId(value);
    localStorage.setItem(MOBILE_STAFF_STORAGE_KEY, value);
  }

  function doneEntries(planItemId) {
    return loggedNotes
      .filter((n) => n.plan_item_ids?.includes(planItemId))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  function taskLine(item) {
    return item.instructions ? `${item.label} — ${item.instructions}` : item.label;
  }

  // A tap within CONSOLIDATE_WINDOW_MS of the same author's most recent
  // plan-tap entry merges into it instead of creating a new worksheet row —
  // same consolidation as DayTreatmentPlan, since several checklist items
  // are typically ticked off in one pass.
  function findMergeableNote() {
    const now = Date.now();
    const isValid = (n) =>
      n?.plan_item_ids?.length > 0 &&
      (n.author_id || null) === (authorId || null) &&
      now - new Date(n.created_at).getTime() < CONSOLIDATE_WINDOW_MS;

    if (isValid(lastNoteRef.current)) return lastNoteRef.current;
    return loggedNotes.filter(isValid).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  }

  async function logTask(item) {
    setError(null);
    setLoggingId(item.id);

    try {
      const mergeInto = findMergeableNote();
      if (mergeInto) {
        await mergeTaskIntoNote(mergeInto, item);
      } else {
        await createTaskNote(item);
      }
    } catch (err) {
      setLoggingId(null);
      setError(err.message || 'Failed to log task');
      return;
    }
    setLoggingId(null);
    loadLoggedNotes();
  }

  async function createTaskNote(item) {
    const res = await fetch(`/api/hospitalizations/${hospitalizationId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_id: authorId || null,
        note_date: todayISODate(),
        notes: taskLine(item),
        plan_item_ids: [item.id],
        treatment_items: item.goods_service_id
          ? [{ goods_service_id: item.goods_service_id, quantity: 1, administration_method: item.administration_method }]
          : [],
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to log task');
    lastNoteRef.current = data;
  }

  async function mergeTaskIntoNote(note, item) {
    const patchRes = await fetch(`/api/hospitalizations/${hospitalizationId}/notes/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notes: [note.notes, taskLine(item)].filter(Boolean).join('\n'),
        plan_item_ids: [...note.plan_item_ids, item.id],
      }),
    });
    const patched = await patchRes.json();
    if (!patchRes.ok) throw new Error(patched.error || 'Failed to log task');
    lastNoteRef.current = patched;

    if (!item.goods_service_id) return;
    const itemRes = await fetch('/api/treatment-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hospitalization_note_id: note.id,
        goods_service_id: item.goods_service_id,
        quantity: 1,
        administration_method: item.administration_method,
      }),
    });
    if (!itemRes.ok) {
      const data = await itemRes.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to log task');
    }
  }

  async function addPlanItem(payload) {
    setError(null);
    const res = await fetch(`/api/hospitalizations/${hospitalizationId}/plan-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Failed to add task');
      return;
    }
    loadPlanItems();
  }

  async function addCustomTask() {
    if (!customLabel.trim()) return;
    await addPlanItem({ label: customLabel.trim() });
    setCustomLabel('');
    setShowCustomAdd(false);
  }

  async function addCatalogTask() {
    if (!catalogGoodsServiceId) return;
    const item = catalog.find((c) => c.id === catalogGoodsServiceId);
    if (!item) return;
    if (item.administration_method === 'injectable' && !catalogAdministrationMethod) return;
    await addPlanItem({
      label: item.name,
      goods_service_id: item.id,
      instructions: catalogInstructions.trim() || null,
      administration_method: catalogAdministrationMethod || null,
    });
    setCatalogGoodsServiceId('');
    setCatalogInstructions('');
    setCatalogAdministrationMethod('');
    setShowCatalogAdd(false);
  }

  async function removePlanItem(id) {
    if (!confirm('Remove this item from the checklist? Past log entries are kept.')) return;
    setDeletingId(id);
    await fetch(`/api/hospitalization-plan-items/${id}`, { method: 'DELETE' });
    setDeletingId(null);
    loadPlanItems();
  }

  function startLongPress(item) {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      openEditItem(item);
    }, 550);
  }

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function openEditItem(item) {
    setError(null);
    setEditingItemId(item.id);
    setEditGoodsServiceId(item.goods_service_id || '');
    setEditInstructions(item.instructions || '');
    setEditAdministrationMethod(item.administration_method || '');
  }

  function cancelEditItem() {
    setEditingItemId(null);
  }

  async function saveEditItem(itemId) {
    const catalogItem = catalog.find((c) => c.id === editGoodsServiceId);
    const label = catalogItem ? catalogItem.name : planItems.find((p) => p.id === itemId)?.label;
    if (!label) return;
    setEditSaving(true);
    setError(null);
    const res = await fetch(`/api/hospitalization-plan-items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label,
        goods_service_id: editGoodsServiceId || null,
        instructions: editInstructions.trim() || null,
        administration_method: editAdministrationMethod || null,
      }),
    });
    setEditSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Failed to update item');
      return;
    }
    setEditingItemId(null);
    loadPlanItems();
  }

  function authorName(id) {
    return staff.find((s) => s.id === id)?.full_name || 'Unknown';
  }

  return (
    <div className="card procedure-checklist">
      <div className="procedure-checklist-header">
        <h3>Procedure Checklist</h3>
        <AudioRecorder entityType="hospitalization_plan" entityId={hospitalizationId} onExtractedFields={loadPlanItems} />
      </div>
      <p className="visit-meta">Dictated once, matched automatically against the service catalog — no manual data entry.</p>
      {error && <p className="error">{error}</p>}

      <select className="day-plan-author" value={authorId} onChange={(e) => handleAuthorChange(e.target.value)}>
        <option value="">Logging as...</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name}
          </option>
        ))}
      </select>

      {planItems.length === 0 && <p className="visit-meta">Nothing on the checklist yet — dictate it or add items below.</p>}

      {planItems.map((item) => {
        const done = doneEntries(item.id);
        const isDone = done.length > 0;
        const last = done[done.length - 1];
        const link = checklistLink(item, catalog);
        return (
          <div key={item.id} className="procedure-checklist-row">
            <button
              type="button"
              className={`procedure-checklist-status${isDone ? ' done' : ' pending'}`}
              onClick={() => {
                if (longPressFired.current) {
                  longPressFired.current = false;
                  return;
                }
                logTask(item);
              }}
              onPointerDown={() => startLongPress(item)}
              onPointerUp={cancelLongPress}
              onPointerLeave={cancelLongPress}
              onContextMenu={(e) => e.preventDefault()}
              disabled={loggingId === item.id}
              title="Long-press to correct its catalog item"
            >
              {loggingId === item.id ? 'Logging…' : isDone ? '✓ Done' : 'Not done yet'}
            </button>
            <span className="procedure-checklist-label">
              {item.label}
              {item.administration_method && ` (${ADMINISTRATION_METHOD_LABELS[item.administration_method]})`}
              {item.instructions && <span className="sub"> — {item.instructions}</span>}
              {isDone && (
                <span className="visit-meta">
                  {' '}
                  · {done.length > 1 ? `${done.length}× · ` : ''}last {formatTime(last.created_at)} · {authorName(last.author_id)}
                </span>
              )}
            </span>
            {link && (
              <a className="procedure-checklist-link" href={link.href}>
                {link.label} →
              </a>
            )}
            <button
              type="button"
              className="day-plan-remove"
              onClick={() => removePlanItem(item.id)}
              disabled={deletingId === item.id}
              title="Remove from checklist"
            >
              &times;
            </button>
            {editingItemId === item.id && (
              <div className="day-plan-catalog-add day-plan-edit-task">
                <CatalogPicker
                  catalog={catalog}
                  subcategories={subcategories}
                  value={editGoodsServiceId}
                  onChange={setEditGoodsServiceId}
                  onItemCreated={onCatalogItemCreated}
                />
                {catalog.find((c) => c.id === editGoodsServiceId)?.administration_method === 'injectable' && (
                  <AdministrationRoutePicker value={editAdministrationMethod} onChange={setEditAdministrationMethod} />
                )}
                <input
                  placeholder="Instructions (e.g. PO with food, twice daily)"
                  value={editInstructions}
                  onChange={(e) => setEditInstructions(e.target.value)}
                />
                <div className="day-plan-edit-actions">
                  <button
                    type="button"
                    onClick={() => saveEditItem(item.id)}
                    disabled={
                      editSaving ||
                      (catalog.find((c) => c.id === editGoodsServiceId)?.administration_method === 'injectable' &&
                        !editAdministrationMethod)
                    }
                  >
                    {editSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" onClick={cancelEditItem} disabled={editSaving}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="day-plan-add-row">
        <button type="button" className="pill-btn" onClick={() => setShowCatalogAdd((v) => !v)}>
          + From Catalog
        </button>
        <button type="button" className="pill-btn" onClick={() => setShowCustomAdd((v) => !v)}>
          + Custom Item
        </button>
      </div>

      {showCatalogAdd && (
        <div className="day-plan-catalog-add">
          <CatalogPicker
            catalog={catalog}
            subcategories={subcategories}
            value={catalogGoodsServiceId}
            onChange={setCatalogGoodsServiceId}
            onItemCreated={onCatalogItemCreated}
          />
          {catalog.find((c) => c.id === catalogGoodsServiceId)?.administration_method === 'injectable' && (
            <AdministrationRoutePicker value={catalogAdministrationMethod} onChange={setCatalogAdministrationMethod} />
          )}
          <input
            placeholder="Instructions (e.g. PO with food, twice daily)"
            value={catalogInstructions}
            onChange={(e) => setCatalogInstructions(e.target.value)}
          />
          <button
            type="button"
            onClick={addCatalogTask}
            disabled={
              !catalogGoodsServiceId ||
              (catalog.find((c) => c.id === catalogGoodsServiceId)?.administration_method === 'injectable' &&
                !catalogAdministrationMethod)
            }
          >
            Add to Checklist
          </button>
        </div>
      )}

      {showCustomAdd && (
        <div className="day-plan-custom-add">
          <input
            placeholder="Item name (e.g. Ear Clean)"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
          />
          <button type="button" onClick={addCustomTask} disabled={!customLabel.trim()}>
            Add
          </button>
        </div>
      )}
    </div>
  );
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
