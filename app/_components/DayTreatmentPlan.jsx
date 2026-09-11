// app/_components/DayTreatmentPlan.jsx
// A per-admission set of recurring/one-off care tasks (meds, checks,
// routine care) shown as tap-to-log buttons — used on both the admin and
// mobile hospitalization detail pages. Tapping a task posts a normal
// worksheet entry (POST .../notes, tagged with plan_item_ids) so it shows
// up in the existing Day-to-day Worksheet below, same as anything typed
// by hand; a catalog-linked task also gets a treatment_item so it still
// reaches the invoice. The plan itself (the list of buttons) carries over
// day to day until changed — only which taps count as "today" resets.
//
// Taps happen in bursts during rounds (several meds/checks logged one
// after another) — rather than a separate worksheet entry per tap, a tap
// within CONSOLIDATE_WINDOW_MS of the same author's last entry merges into
// it (see logTask): the note's text and plan_item_ids grow, and a
// catalog-linked task also gets its own treatment_item on that same note.

'use client';

import { useEffect, useRef, useState } from 'react';
import AudioRecorder from '@/app/_components/AudioRecorder';
import CatalogPicker from '@/app/_components/CatalogPicker';
import AdministrationRoutePicker from '@/app/_components/AdministrationRoutePicker';
import { ADMINISTRATION_METHOD_LABELS } from '@/lib/administrationMethods';
import { supabase } from '@/lib/supabaseClient';

const MOBILE_STAFF_STORAGE_KEY = 'europets_mobile_staff_id';
const QUICK_TASKS = ['Cage Cleaned', 'Water Changed', 'Food Given', 'Patient Checked', 'Walked / Exercised'];
const LONG_PRESS_MS = 550;
const CONSOLIDATE_WINDOW_MS = 5 * 60 * 1000;

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default function DayTreatmentPlan({ hospitalizationId, staff = [], catalog, subcategories, onCatalogItemCreated }) {
  const [planItems, setPlanItems] = useState([]);
  const [todayNotes, setTodayNotes] = useState([]);
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

  function loadTodayNotes() {
    fetch(`/api/hospitalizations/${hospitalizationId}/notes`)
      .then((res) => res.json())
      .then((data) => {
        const today = todayISODate();
        setTodayNotes(
          Array.isArray(data) ? data.filter((n) => n.plan_item_ids?.length > 0 && n.note_date === today) : []
        );
      });
  }

  useEffect(() => {
    loadPlanItems();
    loadTodayNotes();
    lastNoteRef.current = null;
    const remembered = localStorage.getItem(MOBILE_STAFF_STORAGE_KEY);
    if (remembered) setAuthorId(remembered);

    const channel = supabase
      .channel(`day-plan-${hospitalizationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hospitalization_plan_items', filter: `hospitalization_id=eq.${hospitalizationId}` },
        loadPlanItems
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hospitalization_notes', filter: `hospitalization_id=eq.${hospitalizationId}` },
        loadTodayNotes
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitalizationId]);

  function handleAuthorChange(value) {
    setAuthorId(value);
    localStorage.setItem(MOBILE_STAFF_STORAGE_KEY, value);
  }

  function doneToday(planItemId) {
    return todayNotes
      .filter((n) => n.plan_item_ids?.includes(planItemId))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  function taskLine(item) {
    return item.instructions ? `${item.label} — ${item.instructions}` : item.label;
  }

  // A tap within CONSOLIDATE_WINDOW_MS of the same author's most recent
  // plan-tap entry merges into it instead of creating a new worksheet row —
  // several meds/checks logged one after another during rounds land as one
  // entry with one timestamp, not a scattered row per tap. Tracked in a ref
  // (updated synchronously right after each successful log) rather than
  // read back from todayNotes, so a second tap fired before the first
  // one's reload finishes still finds the note to merge into.
  function findMergeableNote() {
    const now = Date.now();
    const isValid = (n) =>
      n?.plan_item_ids?.length > 0 &&
      (n.author_id || null) === (authorId || null) &&
      now - new Date(n.created_at).getTime() < CONSOLIDATE_WINDOW_MS;

    if (isValid(lastNoteRef.current)) return lastNoteRef.current;
    return todayNotes.filter(isValid).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
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
    loadTodayNotes();
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

  async function addQuickTask(label) {
    await addPlanItem({ label });
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
    if (!confirm('Remove this task from the plan? Past log entries are kept.')) return;
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
    }, LONG_PRESS_MS);
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
      setError(data.error || 'Failed to update task');
      return;
    }
    setEditingItemId(null);
    loadPlanItems();
  }

  function authorName(id) {
    return staff.find((s) => s.id === id)?.full_name || 'Unknown';
  }

  const existingLabels = new Set(planItems.map((t) => t.label));
  const remainingQuickTasks = QUICK_TASKS.filter((q) => !existingLabels.has(q));

  return (
    <div className="day-plan">
      {error && <p className="error">{error}</p>}

      <div className="day-plan-header">
        <h3>Day Treatment Plan</h3>
        <select className="day-plan-author" value={authorId} onChange={(e) => handleAuthorChange(e.target.value)}>
          <option value="">Logging as...</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
      </div>

      {planItems.length === 0 && <p className="visit-meta">No tasks on the plan yet — add one below.</p>}
      {planItems.length > 0 && <p className="visit-meta day-plan-hint">Long-press a task to correct its catalog item.</p>}

      <div className="day-plan-grid">
        {planItems.map((item) => {
          const done = doneToday(item.id);
          const last = done[done.length - 1];
          return (
            <div key={item.id} className={`day-plan-task${done.length ? ' done' : ''}`}>
              <button
                type="button"
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
              >
                <span className="day-plan-task-label">
                  {item.label}
                  {item.administration_method && ` (${ADMINISTRATION_METHOD_LABELS[item.administration_method]})`}
                </span>
                {item.instructions && <span className="day-plan-task-meta">{item.instructions}</span>}
                <span className="day-plan-task-status">
                  {loggingId === item.id
                    ? 'Logging...'
                    : done.length
                      ? `✓ ${done.length > 1 ? `${done.length}× today · ` : ''}last ${formatTime(last.created_at)} · ${authorName(last.author_id)}`
                      : 'Not done yet today'}
                </span>
              </button>
              <button
                type="button"
                className="day-plan-remove"
                onClick={() => removePlanItem(item.id)}
                disabled={deletingId === item.id}
                title="Remove from plan"
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
      </div>

      <div className="day-plan-add-row">
        <AudioRecorder entityType="hospitalization_plan" entityId={hospitalizationId} onExtractedFields={loadPlanItems} />
        <button type="button" className="pill-btn" onClick={() => setShowCatalogAdd((v) => !v)}>
          + From Catalog
        </button>
        <button type="button" className="pill-btn" onClick={() => setShowCustomAdd((v) => !v)}>
          + Custom Task
        </button>
      </div>

      {remainingQuickTasks.length > 0 && (
        <div className="day-plan-chips">
          {remainingQuickTasks.map((q) => (
            <button type="button" key={q} className="chip" onClick={() => addQuickTask(q)}>
              + {q}
            </button>
          ))}
        </div>
      )}

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
            Add to Plan
          </button>
        </div>
      )}

      {showCustomAdd && (
        <div className="day-plan-custom-add">
          <input
            placeholder="Task name (e.g. Change bandage)"
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
