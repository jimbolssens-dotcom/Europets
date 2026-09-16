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
import { ADMINISTRATION_METHOD_LABELS } from '@/lib/administrationMethods';
import { checklistItemAction } from '@/lib/checklistItemAction';
import { dubaiDayBoundaries } from '@/lib/dubaiTime';
import { supabase } from '@/lib/supabaseClient';

const MOBILE_STAFF_STORAGE_KEY = 'europets_mobile_staff_id';
const QUICK_TASKS = ['Cage Cleaned', 'Water Changed', 'Food Given', 'Patient Checked', 'Walked / Exercised'];
const LONG_PRESS_MS = 550;
const CONSOLIDATE_WINDOW_MS = 5 * 60 * 1000;

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default function DayTreatmentPlan({ hospitalizationId, admittedAt, staff = [], catalog, subcategories, onCatalogItemCreated, onOpenReport }) {
  const [planItems, setPlanItems] = useState([]);
  const [todayNotes, setTodayNotes] = useState([]);
  const [authorId, setAuthorId] = useState('');
  const [loggingIds, setLoggingIds] = useState(() => new Set());
  const [vitalsInputFor, setVitalsInputFor] = useState(null);
  const [vitalsValue, setVitalsValue] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [openingTestId, setOpeningTestId] = useState(null);
  const [showCatalogAdd, setShowCatalogAdd] = useState(false);
  const [catalogGoodsServiceId, setCatalogGoodsServiceId] = useState('');
  const [catalogInstructions, setCatalogInstructions] = useState('');
  const [showCustomAdd, setShowCustomAdd] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [error, setError] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editGoodsServiceId, setEditGoodsServiceId] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const longPressTimer = useRef(null);
  const longPressFired = useRef(false);
  const lastNoteRef = useRef(null);
  const logQueueRef = useRef(Promise.resolve());

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
      // A vitals reading (weight_kg/temperature_c set) is never a merge
      // target — its numeric value is the whole point of the entry, and
      // folding an unrelated task tap's text into that same row would
      // muddy an otherwise-precise reading. Every vitals note is its own
      // row for exactly this reason (see logVitalsReading).
      n.weight_kg == null &&
      n.temperature_c == null &&
      (n.author_id || null) === (authorId || null) &&
      now - new Date(n.created_at).getTime() < CONSOLIDATE_WINDOW_MS;

    if (isValid(lastNoteRef.current)) return lastNoteRef.current;
    return todayNotes.filter(isValid).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  }

  // Taps fire off fetches without waiting for each other, so two tasks
  // tapped closer together than one round-trip would otherwise both call
  // findMergeableNote() before either's create/merge has actually
  // finished — each sees no mergeable note yet and both create their own
  // entry instead of the second merging into the first. Chaining every
  // tap onto one shared queue forces them to run strictly one after
  // another, so by the time a tap checks for a mergeable note, the
  // previous tap's result (via lastNoteRef, updated synchronously) is
  // already there to merge into.
  function logTask(item) {
    setError(null);
    setLoggingIds((prev) => new Set(prev).add(item.id));

    const run = async () => {
      try {
        const mergeInto = findMergeableNote();
        if (mergeInto) {
          await mergeTaskIntoNote(mergeInto, item);
        } else {
          await createTaskNote(item);
        }
      } catch (err) {
        setError(err.message || 'Failed to log task');
      } finally {
        setLoggingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        loadTodayNotes();
      }
    };

    logQueueRef.current = logQueueRef.current.then(run, run);
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

  // Temperature/Weight (see migration 104) log differently from every
  // other plan item: tapping opens a small number input instead of
  // logging immediately, and submitting always creates its own new
  // worksheet row — never merged into a recent one (see the merge
  // exclusion in findMergeableNote above) and never logged without a
  // real value typed in.
  function startVitalsInput(item) {
    setError(null);
    setVitalsInputFor(item.id);
    setVitalsValue('');
  }

  function cancelVitalsInput() {
    setVitalsInputFor(null);
    setVitalsValue('');
  }

  async function submitVitalsReading(item) {
    const value = parseFloat(vitalsValue);
    if (!Number.isFinite(value) || value <= 0) {
      setError(`Enter a valid ${item.kind === 'vitals_weight' ? 'weight' : 'temperature'}`);
      return;
    }
    setError(null);
    setLoggingIds((prev) => new Set(prev).add(item.id));
    try {
      const body = {
        author_id: authorId || null,
        note_date: todayISODate(),
        plan_item_ids: [item.id],
      };
      if (item.kind === 'vitals_weight') body.weight_kg = value;
      if (item.kind === 'vitals_temperature') body.temperature_c = value;

      const res = await fetch(`/api/hospitalizations/${hospitalizationId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to log reading');
      setVitalsInputFor(null);
      setVitalsValue('');
      loadTodayNotes();
    } catch (err) {
      setError(err.message || 'Failed to log reading');
    } finally {
      setLoggingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  // Live "is this overdue yet" hint shown right on the tile — the
  // authoritative version (surfaced as the blinking-cage alert on Cage
  // Layout/Hospital Wall/nav badges) is computed server-side in
  // GET /api/hospitalizations (attachScheduledUpdateStatus), same day-boundary
  // math, from the whole worksheet rather than just what's loaded here.
  function vitalsStatus(item, done) {
    if (!admittedAt) return { overdue: false, label: null };
    const { nowMs, noonUtcMs, eveningUtcMs } = dubaiDayBoundaries();
    const admittedMs = new Date(admittedAt).getTime();

    if (item.kind === 'vitals_weight') {
      const expected = nowMs >= eveningUtcMs && admittedMs < eveningUtcMs;
      const overdue = expected && done.length === 0;
      return { overdue, label: overdue ? 'Not checked today' : null };
    }

    const morningExpected = nowMs >= noonUtcMs && admittedMs < noonUtcMs;
    const afternoonExpected = nowMs >= eveningUtcMs && admittedMs < eveningUtcMs;
    const morningDone = done.some((n) => new Date(n.created_at).getTime() < noonUtcMs);
    const afternoonDone = done.some((n) => new Date(n.created_at).getTime() >= noonUtcMs);
    const morningOverdue = morningExpected && !morningDone;
    const afternoonOverdue = afternoonExpected && !afternoonDone;
    let label = null;
    if (morningOverdue && afternoonOverdue) label = 'Morning & afternoon checks overdue';
    else if (afternoonOverdue) label = 'Afternoon check overdue';
    else if (morningOverdue) label = 'Morning check overdue';
    return { overdue: morningOverdue || afternoonOverdue, label };
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
    await addPlanItem({
      label: item.name,
      goods_service_id: item.id,
      instructions: catalogInstructions.trim() || null,
    });
    // A plan item that's a lab test is also ordered as a diagnostic the
    // moment it lands on the plan (not just once its "Enter Test Result"
    // button below is first clicked) — same find-or-create as
    // openTestResult, so it's already waiting in the Reports section for
    // a result to be entered later, findable from either place. Best-
    // effort: an admission with reports not yet loaded (onOpenReport not
    // wired up) just skips this, same as elsewhere it's optional.
    if (checklistItemAction({ goods_service_id: item.id, label: item.name }, catalog, subcategories) === 'test') {
      onOpenReport?.('test', { goodsServiceId: item.id })?.catch(() => {});
    }
    setCatalogGoodsServiceId('');
    setCatalogInstructions('');
    setShowCatalogAdd(false);
  }

  async function removePlanItem(id) {
    if (!confirm('Remove this task from the plan? Past log entries are kept.')) return;
    setDeletingId(id);
    await fetch(`/api/hospitalization-plan-items/${id}`, { method: 'DELETE' });
    setDeletingId(null);
    loadPlanItems();
  }

  // A plan item recognized as a lab test (blood panel, PCR, fecal, urine,
  // ...) never gets its own diagnostics row just from being on this plan —
  // ticking it done only logs a worksheet note, same as any other task.
  // This asks the page's Reports section to find-or-create the matching
  // diagnostic (same catalog item) so there's an actual result field/
  // photo/file upload to land on, then scrolls to it — see
  // HospitalizationReportsSection.openOrStartTestResult.
  async function openTestResult(item) {
    setOpeningTestId(item.id);
    setError(null);
    try {
      await onOpenReport?.('test', { goodsServiceId: item.goods_service_id });
      document.querySelector('#report-test-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      setError(err.message || 'Failed to open the test result');
    } finally {
      setOpeningTestId(null);
    }
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

  const vitalsItems = planItems.filter((item) => item.kind === 'vitals_temperature' || item.kind === 'vitals_weight');
  const taskItems = planItems.filter((item) => item.kind !== 'vitals_temperature' && item.kind !== 'vitals_weight');
  const existingLabels = new Set(taskItems.map((t) => t.label));
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

      {vitalsItems.length > 0 && (
        <div className="day-plan-vitals">
          {vitalsItems.map((item) => {
            const done = doneToday(item.id);
            const last = done[done.length - 1];
            const status = vitalsStatus(item, done);
            const unit = item.kind === 'vitals_weight' ? 'kg' : '°C';
            const isEntering = vitalsInputFor === item.id;
            return (
              <div
                key={item.id}
                className={`day-plan-vitals-tile${done.length ? ' done' : ''}${status.overdue ? ' overdue' : ''}`}
              >
                <div className="day-plan-vitals-top">
                  <span className="day-plan-task-label">{item.label}</span>
                  <span className="day-plan-task-status">
                    {done.length
                      ? `✓ ${done.length > 1 ? `${done.length}× today · ` : ''}last ${
                          item.kind === 'vitals_weight' ? last.weight_kg : last.temperature_c
                        }${unit} at ${formatTime(last.created_at)} · ${authorName(last.author_id)}`
                      : 'Not logged yet today'}
                  </span>
                  {status.label && <span className="day-plan-vitals-warning">⚠ {status.label}</span>}
                </div>
                {isEntering ? (
                  <div className="day-plan-vitals-input">
                    <input
                      type="number"
                      step={item.kind === 'vitals_weight' ? '0.01' : '0.1'}
                      autoFocus
                      placeholder={item.kind === 'vitals_weight' ? 'Weight (kg)' : 'Temperature (°C)'}
                      value={vitalsValue}
                      onChange={(e) => setVitalsValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitVitalsReading(item)}
                    />
                    <button type="button" onClick={() => submitVitalsReading(item)} disabled={loggingIds.has(item.id)}>
                      {loggingIds.has(item.id) ? 'Logging...' : 'Log'}
                    </button>
                    <button type="button" onClick={cancelVitalsInput} disabled={loggingIds.has(item.id)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button type="button" className="pill-btn" onClick={() => startVitalsInput(item)}>
                    + Log {item.label}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {taskItems.length === 0 && <p className="visit-meta">No tasks on the plan yet — add one below.</p>}
      {taskItems.length > 0 && <p className="visit-meta day-plan-hint">Long-press a task to correct its catalog item.</p>}

      <div className="day-plan-grid">
        {taskItems.map((item) => {
          const done = doneToday(item.id);
          const last = done[done.length - 1];
          const isTest = checklistItemAction(item, catalog, subcategories) === 'test';
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
                disabled={loggingIds.has(item.id)}
              >
                <span className="day-plan-task-label">
                  {item.label}
                  {item.administration_method && ` (${ADMINISTRATION_METHOD_LABELS[item.administration_method]})`}
                </span>
                {item.instructions && <span className="day-plan-task-meta">{item.instructions}</span>}
                <span className="day-plan-task-status">
                  {loggingIds.has(item.id)
                    ? 'Logging...'
                    : done.length
                      ? `✓ ${done.length > 1 ? `${done.length}× today · ` : ''}last ${formatTime(last.created_at)} · ${authorName(last.author_id)}`
                      : 'Not done yet today'}
                </span>
              </button>
              {isTest && onOpenReport && (
                <button
                  type="button"
                  className="procedure-checklist-link day-plan-test-link"
                  onClick={() => openTestResult(item)}
                  disabled={openingTestId === item.id}
                >
                  {openingTestId === item.id ? 'Opening…' : 'Enter Test Result →'}
                </button>
              )}
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
                  <input
                    placeholder="Instructions (e.g. PO with food, twice daily)"
                    value={editInstructions}
                    onChange={(e) => setEditInstructions(e.target.value)}
                  />
                  <div className="day-plan-edit-actions">
                    <button type="button" onClick={() => saveEditItem(item.id)} disabled={editSaving}>
                      {editSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button type="button" onClick={cancelEditItem} disabled={editSaving}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="day-plan-delete-action"
                      onClick={() => removePlanItem(item.id)}
                      disabled={editSaving || deletingId === item.id}
                    >
                      {deletingId === item.id ? 'Removing...' : 'Delete'}
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
          <input
            placeholder="Instructions (e.g. PO with food, twice daily)"
            value={catalogInstructions}
            onChange={(e) => setCatalogInstructions(e.target.value)}
          />
          <button type="button" onClick={addCatalogTask} disabled={!catalogGoodsServiceId}>
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
