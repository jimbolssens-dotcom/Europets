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
//
// A consult's own medications (visit-linked treatment_items) and a stay's
// Day Treatment Plan (hospitalization-linked treatment_items) used to be
// two completely disconnected billing trails — nothing carried a consult's
// meds across when it became an admission, so the exact same drug given at
// consult and then logged again on the plan billed twice for one real
// administration. originatingVisitId (when the admission came from a
// consult) fixes that three ways: the consult's own items show as a
// read-only reference list below (so "it's on the plan that this was
// given" no longer requires re-logging it), the very first tap of a plan
// item matching one of them prompts "new dose, or the same one?" instead
// of silently billing again (see needsConsultDuplicateCheck), and every
// tile also gets a manual "🚫 log without charging" button as the general
// escape hatch for anything the automatic check doesn't catch.

'use client';

import { useEffect, useRef, useState } from 'react';
import AudioRecorder from '@/app/_components/AudioRecorder';
import CatalogPicker from '@/app/_components/CatalogPicker';
import TempDial from '@/app/_components/TempDial';
import WeightDial from '@/app/_components/WeightDial';
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

export default function DayTreatmentPlan({ hospitalizationId, admittedAt, originatingVisitId, staff = [], catalog, subcategories, onCatalogItemCreated, onOpenReport, onFileWeightKg }) {
  const [planItems, setPlanItems] = useState([]);
  // Everything already given (and billed) during the consult this
  // admission started from, if any — shown as its own read-only section
  // below and cross-checked against the first tap of a matching plan item
  // (see needsConsultDuplicateCheck) so the exact bug that prompted this —
  // a medication given at consult getting billed a second time the moment
  // it's also logged on the Day Treatment Plan — has both a visible record
  // that it already happened, and a prompt at the one moment it'd
  // otherwise double-charge silently.
  const [consultTreatmentItems, setConsultTreatmentItems] = useState([]);
  // The plan item currently waiting on the "already given at consult —
  // new dose, or the same one?" choice, instead of logging immediately.
  const [duplicateCheckItem, setDuplicateCheckItem] = useState(null);
  // Every plan-tagged note for the whole stay, not just today — a
  // 'one_time' item (see migration 105) needs to know if it was EVER
  // logged, not just today, so it can stop asking once it's done for
  // good. once_daily/twice_daily items still only care about today's
  // slice, filtered out of this same list below (see `todayNotes`).
  const [planNotes, setPlanNotes] = useState([]);
  const [authorId, setAuthorId] = useState('');
  const [loggingIds, setLoggingIds] = useState(() => new Set());
  const [loggingQuickLabel, setLoggingQuickLabel] = useState(null);
  const [vitalsInputFor, setVitalsInputFor] = useState(null);
  const [vitalsValue, setVitalsValue] = useState('');
  // A long-press on the Temperature tile's +Log button opens this instead
  // of the plain typed input above — see startLongPress/startVitalsDial.
  const [dialInputFor, setDialInputFor] = useState(null);
  const [dialValue, setDialValue] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [openingTestId, setOpeningTestId] = useState(null);
  const [showCatalogAdd, setShowCatalogAdd] = useState(false);
  const [catalogGoodsServiceId, setCatalogGoodsServiceId] = useState('');
  const [catalogInstructions, setCatalogInstructions] = useState('');
  const [catalogFrequency, setCatalogFrequency] = useState('once_daily');
  const [catalogQuantity, setCatalogQuantity] = useState('1');
  const [catalogBillOnce, setCatalogBillOnce] = useState(false);
  const [showCustomAdd, setShowCustomAdd] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customFrequency, setCustomFrequency] = useState('once_daily');
  const [error, setError] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editGoodsServiceId, setEditGoodsServiceId] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [editFrequency, setEditFrequency] = useState('once_daily');
  const [editQuantity, setEditQuantity] = useState('1');
  const [editBillOnce, setEditBillOnce] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const longPressTimer = useRef(null);
  const longPressFired = useRef(false);
  const lastNoteRef = useRef(null);
  const logQueueRef = useRef(Promise.resolve());

  const today = todayISODate();
  const todayNotes = planNotes.filter((n) => n.note_date === today);

  function loadPlanItems() {
    fetch(`/api/hospitalizations/${hospitalizationId}/plan-items`)
      .then((res) => res.json())
      .then((data) => setPlanItems(Array.isArray(data) ? data : []));
  }

  function loadPlanNotes() {
    fetch(`/api/hospitalizations/${hospitalizationId}/notes`)
      .then((res) => res.json())
      .then((data) => {
        setPlanNotes(Array.isArray(data) ? data.filter((n) => n.plan_item_ids?.length > 0) : []);
      });
  }

  useEffect(() => {
    if (!originatingVisitId) {
      setConsultTreatmentItems([]);
      return;
    }
    fetch(`/api/treatment-items?visit_id=${originatingVisitId}`)
      .then((res) => res.json())
      .then((data) => setConsultTreatmentItems(Array.isArray(data) ? data.filter((t) => t.goods_service_id) : []));
  }, [originatingVisitId]);

  useEffect(() => {
    loadPlanItems();
    loadPlanNotes();
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
        loadPlanNotes
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

  // 'one_time' items (migration 105) check against the whole stay, not
  // just today — once this has anything in it, the item is done for good.
  function doneEver(planItemId) {
    return planNotes
      .filter((n) => n.plan_item_ids?.includes(planItemId))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  function taskLine(item) {
    return item.instructions ? `${item.label} — ${item.instructions}` : item.label;
  }

  // A tap within CONSOLIDATE_WINDOW_MS of the same author's most recent
  // plan-tap entry merges into it instead of creating a new worksheet row —
  // several meds/checks/vitals readings logged one after another during
  // rounds land as one entry with one timestamp, not a scattered row per
  // tap. Tracked in a ref (updated synchronously right after each
  // successful log) rather than read back from todayNotes, so a second tap
  // fired before the first one's reload finishes still finds the note to
  // merge into.
  //
  // vitalsField (null for a regular task tap, 'weight_kg'/'temperature_c'
  // for a vitals reading) is the one thing that still blocks a merge: two
  // readings of the SAME field within the window can't share a row — the
  // second would silently overwrite the first's value — so that case still
  // gets its own row. Everything else merges freely: a task's text next to
  // an already-set vitals value, or a vitals value folded onto a note that
  // hasn't logged that field yet, all on one row.
  function findMergeableNote(vitalsField = null) {
    const now = Date.now();
    const isValid = (n) =>
      n?.plan_item_ids?.length > 0 &&
      (vitalsField == null || n[vitalsField] == null) &&
      (n.author_id || null) === (authorId || null) &&
      now - new Date(n.created_at).getTime() < CONSOLIDATE_WINDOW_MS;

    if (isValid(lastNoteRef.current)) return lastNoteRef.current;
    return todayNotes.filter(isValid).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  }

  // True only the very first time this plan item would be logged (later
  // taps are clearly an intentional repeat dose, not a fresh double-count
  // of something the consult already covered) and only when its catalog
  // item matches something already given — and billed — at the consult
  // this admission started from. Scoped this tightly on purpose: it's
  // meant to catch exactly the Blacky-style case (a medication given at
  // consult logged again the moment the stay's own plan takes over), not
  // second-guess every legitimate recurring dose after that.
  function needsConsultDuplicateCheck(item) {
    if (!item.goods_service_id || consultTreatmentItems.length === 0) return false;
    if (doneEver(item.id).length > 0) return false;
    return consultTreatmentItems.some((t) => t.goods_service_id === item.goods_service_id);
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
  //
  // billableOverride (true/false/undefined) comes from the consult-
  // duplicate prompt below, or the tile's own "log without charging"
  // button — undefined just falls through to the normal default (true).
  function logTask(item, billableOverride) {
    setError(null);
    setLoggingIds((prev) => new Set(prev).add(item.id));

    const run = async () => {
      try {
        const mergeInto = findMergeableNote();
        if (mergeInto) {
          await mergeTaskIntoNote(mergeInto, item, billableOverride);
        } else {
          await createTaskNote(item, billableOverride);
        }
      } catch (err) {
        setError(err.message || 'Failed to log task');
      } finally {
        setLoggingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        loadPlanNotes();
      }
    };

    logQueueRef.current = logQueueRef.current.then(run, run);
  }

  // The main tap target for a task tile — routes through the consult-
  // duplicate prompt first when needed, otherwise logs immediately exactly
  // as before.
  function handleTaskTap(item) {
    if (needsConsultDuplicateCheck(item)) {
      setDuplicateCheckItem(item);
      return;
    }
    logTask(item);
  }

  function resolveDuplicateCheck(billable) {
    const item = duplicateCheckItem;
    setDuplicateCheckItem(null);
    if (item) logTask(item, billable);
  }

  async function createTaskNote(item, billableOverride) {
    const res = await fetch(`/api/hospitalizations/${hospitalizationId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_id: authorId || null,
        note_date: todayISODate(),
        notes: taskLine(item),
        plan_item_ids: [item.id],
        treatment_items: item.goods_service_id
          ? [
              {
                goods_service_id: item.goods_service_id,
                quantity: item.quantity || 1,
                administration_method: item.administration_method,
                plan_item_id: item.id,
                ...(billableOverride === false ? { billable: false } : {}),
              },
            ]
          : [],
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to log task');
    lastNoteRef.current = data;
  }

  async function mergeTaskIntoNote(note, item, billableOverride) {
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
        quantity: item.quantity || 1,
        administration_method: item.administration_method,
        plan_item_id: item.id,
        ...(billableOverride === false ? { billable: false } : {}),
      }),
    });
    if (!itemRes.ok) {
      const data = await itemRes.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to log task');
    }
  }

  // Temperature/Weight (see migration 104) log differently from every
  // other plan item: tapping opens a small number input instead of
  // logging immediately, and a real value has to be typed in before it
  // logs anything. Submitting still goes through the same merge/queue
  // machinery as a task tap (see findMergeableNote/logTask above) — a
  // reading folds into a nearby note from the same round unless that note
  // already carries a value for this same field.
  function startVitalsInput(item) {
    setError(null);
    setVitalsInputFor(item.id);
    setVitalsValue('');
  }

  function cancelVitalsInput() {
    setVitalsInputFor(null);
    setVitalsValue('');
  }

  async function createVitalsNote(item, vitalsField, value) {
    const res = await fetch(`/api/hospitalizations/${hospitalizationId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_id: authorId || null,
        note_date: todayISODate(),
        plan_item_ids: [item.id],
        [vitalsField]: value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to log reading');
    lastNoteRef.current = data;
  }

  async function mergeVitalsIntoNote(note, item, vitalsField, value) {
    const patchRes = await fetch(`/api/hospitalizations/${hospitalizationId}/notes/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_item_ids: [...note.plan_item_ids, item.id],
        [vitalsField]: value,
      }),
    });
    const patched = await patchRes.json();
    if (!patchRes.ok) throw new Error(patched.error || 'Failed to log reading');
    lastNoteRef.current = patched;
  }

  // explicitValue lets the dial (which already has a real number, not text
  // to parse) submit through this exact same path as the typed input.
  function submitVitalsReading(item, explicitValue) {
    const value = explicitValue != null ? explicitValue : parseFloat(vitalsValue);
    if (!Number.isFinite(value) || value <= 0) {
      setError(`Enter a valid ${item.kind === 'vitals_weight' ? 'weight' : 'temperature'}`);
      return;
    }
    setError(null);
    setLoggingIds((prev) => new Set(prev).add(item.id));
    const vitalsField = item.kind === 'vitals_weight' ? 'weight_kg' : 'temperature_c';

    // Queued onto the same shared queue as logTask (see its comment above)
    // so a vitals reading and a task tap fired close together still see
    // each other's result instead of both racing to create their own row.
    const run = async () => {
      try {
        const mergeInto = findMergeableNote(vitalsField);
        if (mergeInto) {
          await mergeVitalsIntoNote(mergeInto, item, vitalsField, value);
        } else {
          await createVitalsNote(item, vitalsField, value);
        }
        setVitalsInputFor(null);
        setVitalsValue('');
        setDialInputFor(null);
        setDialValue(null);
      } catch (err) {
        setError(err.message || 'Failed to log reading');
      } finally {
        setLoggingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        loadPlanNotes();
      }
    };

    logQueueRef.current = logQueueRef.current.then(run, run);
  }

  // The temperature dial always starts from a fixed "normal" reading (see
  // TempDial's own default) since a stale reading from hours ago is no
  // better a starting point than that — but weight barely changes day to
  // day, so dragging from scratch every time would be needless work. The
  // weight dial instead always opens on the last known weight: whatever was
  // logged most recently THIS stay if anything has been, otherwise the
  // patient's weight on file (see onFileWeightKg, sourced from
  // patients.current_weight_kg) — only falling through to WeightDial's own
  // generic default if neither exists.
  function startVitalsDial(item) {
    setError(null);
    if (item.kind === 'vitals_weight') {
      const last = doneEver(item.id).slice(-1)[0];
      const lastWeight = last ? last.weight_kg : onFileWeightKg;
      setDialValue(lastWeight != null ? Number(lastWeight) : 10.0);
    } else {
      const last = doneToday(item.id).slice(-1)[0];
      setDialValue(last ? last.temperature_c : 38.5);
    }
    setVitalsInputFor(null);
    setDialInputFor(item.id);
  }

  function cancelVitalsDial() {
    setDialInputFor(null);
    setDialValue(null);
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
    // Counts today's readings cumulatively rather than checking each one's
    // own timestamp against noon — see the matching fix (and its full
    // explanation) in attachScheduledUpdateStatus, app/api/hospitalizations/route.js.
    const morningDone = done.length >= 1;
    const afternoonDone = done.length >= 2;
    const morningOverdue = morningExpected && !morningDone;
    const afternoonOverdue = afternoonExpected && !afternoonDone;
    let label = null;
    if (morningOverdue && afternoonOverdue) label = 'Morning & afternoon checks overdue';
    else if (afternoonOverdue) label = 'Afternoon check overdue';
    else if (morningOverdue) label = 'Morning check overdue';
    return { overdue: morningOverdue || afternoonOverdue, label };
  }

  // Quiet, per-tile scheduling hint for regular (non-vitals) tasks — unlike
  // vitalsStatus above, this never feeds the clinic-wide blinking-cage
  // alarm (that stays reserved for the two system vitals items); it's just
  // a visual nudge on the tile itself. Only 'twice_daily' tasks (migration
  // 105) get one — once_daily/one_time already say enough via the plain
  // "Not done yet today" status text next to them.
  function taskFrequencyStatus(item, done) {
    if (item.frequency !== 'twice_daily' || !admittedAt) return { overdue: false, label: null };
    const { nowMs, noonUtcMs, eveningUtcMs } = dubaiDayBoundaries();
    const admittedMs = new Date(admittedAt).getTime();
    const morningExpected = nowMs >= noonUtcMs && admittedMs < noonUtcMs;
    const afternoonExpected = nowMs >= eveningUtcMs && admittedMs < eveningUtcMs;
    // Counts today's readings cumulatively rather than checking each one's
    // own timestamp against noon — see the matching fix (and its full
    // explanation) in attachScheduledUpdateStatus, app/api/hospitalizations/route.js.
    const morningDone = done.length >= 1;
    const afternoonDone = done.length >= 2;
    const morningOverdue = morningExpected && !morningDone;
    const afternoonOverdue = afternoonExpected && !afternoonDone;
    let label = null;
    if (morningOverdue && afternoonOverdue) label = 'Morning & afternoon not done yet';
    else if (afternoonOverdue) label = 'Afternoon not done yet';
    else if (morningOverdue) label = 'Morning not done yet';
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

  // A quick-log chip (Cage Cleaned, Water Changed, ...) is a plain,
  // one-off worksheet note — never a Day Treatment Plan item. Unlike a
  // catalog/custom task, logging one (or not) never needs re-doing daily,
  // shows no overdue warning, and can't feed the hospitalization's
  // attention/alarm indicators (see lib/hospitalizationAttention.js, which
  // only ever looks at owner update requests, scheduled vitals checks and
  // doctor-checkup requests — never at Day Treatment Plan tasks). It used
  // to create a permanent recurring plan item on first tap instead, which
  // meant one click on a routine chore silently turned it into an ongoing
  // daily obligation.
  async function logQuickAction(label) {
    setError(null);
    setLoggingQuickLabel(label);
    try {
      const res = await fetch(`/api/hospitalizations/${hospitalizationId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author_id: authorId || null, note_date: todayISODate(), notes: label }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to log');
      }
      loadPlanNotes();
    } catch (err) {
      setError(err.message || 'Failed to log');
    } finally {
      setLoggingQuickLabel(null);
    }
  }

  async function addCustomTask() {
    if (!customLabel.trim()) return;
    await addPlanItem({ label: customLabel.trim(), frequency: customFrequency });
    setCustomLabel('');
    setCustomFrequency('once_daily');
    setShowCustomAdd(false);
  }

  // Picking a lab-test catalog item defaults the frequency to one-time
  // (it's a single order, not a recurring daily task) — staff can still
  // override it before adding.
  function handleCatalogGoodsServiceChange(id) {
    setCatalogGoodsServiceId(id);
    const item = catalog.find((c) => c.id === id);
    if (item && checklistItemAction({ goods_service_id: item.id, label: item.name }, catalog, subcategories) === 'test') {
      setCatalogFrequency('one_time');
    } else {
      setCatalogFrequency('once_daily');
    }
  }

  async function addCatalogTask() {
    if (!catalogGoodsServiceId) return;
    const item = catalog.find((c) => c.id === catalogGoodsServiceId);
    if (!item) return;
    await addPlanItem({
      label: item.name,
      goods_service_id: item.id,
      instructions: catalogInstructions.trim() || null,
      frequency: catalogFrequency,
      quantity: catalogQuantity,
      bill_once: catalogBillOnce,
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
    setCatalogFrequency('once_daily');
    setCatalogQuantity('1');
    setCatalogBillOnce(false);
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

  // Shared by task tiles (long-press -> edit its catalog item) and the
  // Temperature vitals tile (long-press -> the drag dial) — only one tile
  // is ever being pressed at a time, so the same timer/fired refs work for
  // both without any cross-talk.
  function startLongPress(onFire) {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      onFire();
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
    setEditFrequency(item.frequency || 'once_daily');
    setEditQuantity(String(item.quantity ?? 1));
    setEditBillOnce(!!item.bill_once);
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
        frequency: editFrequency,
        quantity: editQuantity,
        bill_once: editBillOnce,
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
  const taskItemsAll = planItems.filter((item) => item.kind !== 'vitals_temperature' && item.kind !== 'vitals_weight');
  // A 'one_time' task that's already been logged once is done for good —
  // it moves out of the active grid into the Completed section below
  // instead of sitting there doing nothing every day for the rest of the
  // stay (see doneEver).
  const completedOneTimeItems = taskItemsAll.filter((item) => item.frequency === 'one_time' && doneEver(item.id).length > 0);
  const completedIds = new Set(completedOneTimeItems.map((item) => item.id));
  const taskItems = taskItemsAll.filter((item) => !completedIds.has(item.id));
  const existingLabels = new Set(taskItemsAll.map((t) => t.label));
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

      {consultTreatmentItems.length > 0 && (
        <div className="day-plan-consult-items">
          <p className="day-plan-consult-heading">🩺 Given during the consult (already billed there — reference only)</p>
          <ul className="day-plan-consult-list">
            {consultTreatmentItems.map((t) => (
              <li key={t.id}>
                {t.goods_services?.name || 'Item'}
                {t.administration_method && ` (${ADMINISTRATION_METHOD_LABELS[t.administration_method]})`}
                {t.instructions && ` — ${t.instructions}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {duplicateCheckItem && (
        <div className="day-plan-duplicate-check">
          <p>
            <strong>{duplicateCheckItem.label}</strong> was already given during the consult this stay started from —
            is this a new dose, or the same one being noted on the plan?
          </p>
          <div className="day-plan-duplicate-check-actions">
            <button type="button" onClick={() => resolveDuplicateCheck(true)}>
              🆕 New dose — bill it
            </button>
            <button type="button" onClick={() => resolveDuplicateCheck(false)}>
              ♻️ Same one — don't bill again
            </button>
            <button type="button" className="day-plan-cancel-action" onClick={() => setDuplicateCheckItem(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {vitalsItems.length > 0 && (
        <div className="day-plan-vitals">
          {vitalsItems.map((item) => {
            const done = doneToday(item.id);
            const last = done[done.length - 1];
            const status = vitalsStatus(item, done);
            const unit = item.kind === 'vitals_weight' ? 'kg' : '°C';
            const isEntering = vitalsInputFor === item.id;
            const isDialing = dialInputFor === item.id;
            const isWeight = item.kind === 'vitals_weight';
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
                ) : isDialing ? (
                  <div className="day-plan-vitals-dial">
                    {isWeight ? (
                      <WeightDial value={dialValue} onChange={setDialValue} />
                    ) : (
                      <TempDial value={dialValue} onChange={setDialValue} />
                    )}
                    <div className="day-plan-vitals-dial-actions">
                      <button type="button" onClick={() => submitVitalsReading(item, dialValue)} disabled={loggingIds.has(item.id)}>
                        {loggingIds.has(item.id) ? 'Logging...' : 'Log'}
                      </button>
                      <button type="button" onClick={cancelVitalsDial} disabled={loggingIds.has(item.id)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="pill-btn"
                    onClick={() => {
                      if (longPressFired.current) {
                        longPressFired.current = false;
                        return;
                      }
                      startVitalsInput(item);
                    }}
                    onPointerDown={() => startLongPress(() => startVitalsDial(item))}
                    onPointerUp={cancelLongPress}
                    onPointerLeave={cancelLongPress}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    + Log {item.label}
                    <span className="day-plan-vitals-dial-hint"> (hold to drag)</span>
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
          const freqStatus = taskFrequencyStatus(item, done);
          return (
            <div key={item.id} className={`day-plan-task${done.length ? ' done' : ''}${freqStatus.overdue ? ' overdue' : ''}`}>
              <button
                type="button"
                onClick={() => {
                  if (longPressFired.current) {
                    longPressFired.current = false;
                    return;
                  }
                  handleTaskTap(item);
                }}
                onPointerDown={() => startLongPress(() => openEditItem(item))}
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
                {freqStatus.label && <span className="day-plan-task-warning">⚠ {freqStatus.label}</span>}
              </button>
              {item.goods_service_id && (
                <button
                  type="button"
                  className="day-plan-no-charge"
                  onClick={() => logTask(item, false)}
                  disabled={loggingIds.has(item.id)}
                  title="Log this as given, without charging the invoice — e.g. already billed elsewhere"
                >
                  🚫
                </button>
              )}
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
                  <div className="day-plan-catalog-add-picker">
                    <CatalogPicker
                      catalog={catalog}
                      subcategories={subcategories}
                      value={editGoodsServiceId}
                      onChange={setEditGoodsServiceId}
                      onItemCreated={onCatalogItemCreated}
                    />
                  </div>
                  <div className="day-plan-catalog-add-row">
                    <input
                      placeholder="Instructions (e.g. PO with food, twice daily)"
                      value={editInstructions}
                      onChange={(e) => setEditInstructions(e.target.value)}
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="day-plan-qty-input"
                      placeholder="Qty"
                      title="Quantity to log per tap (e.g. 0.5 for half a mL)"
                      value={editQuantity}
                      onChange={(e) => setEditQuantity(e.target.value)}
                    />
                  </div>
                  <ScheduleControl
                    name={`edit-schedule-${item.id}`}
                    frequency={editFrequency}
                    onFrequencyChange={setEditFrequency}
                    billOnce={editBillOnce}
                    onBillOnceChange={setEditBillOnce}
                    showBillOnce={!!editGoodsServiceId}
                  />
                  <div className="day-plan-edit-actions">
                    <button type="button" className="day-plan-save-action" onClick={() => saveEditItem(item.id)} disabled={editSaving}>
                      {editSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button type="button" className="day-plan-cancel-action" onClick={cancelEditItem} disabled={editSaving}>
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

      {remainingQuickTasks.length > 0 && (
        <div className="day-plan-chips">
          {remainingQuickTasks.map((q) => (
            <button
              type="button"
              key={q}
              className="chip"
              onClick={() => logQuickAction(q)}
              disabled={loggingQuickLabel === q}
            >
              {loggingQuickLabel === q ? 'Logging...' : `✓ ${q}`}
            </button>
          ))}
        </div>
      )}

      <div className="day-plan-add-row">
        <AudioRecorder entityType="hospitalization_plan" entityId={hospitalizationId} onExtractedFields={loadPlanItems} />
        <button type="button" className="pill-btn" onClick={() => setShowCatalogAdd((v) => !v)}>
          + From Catalog
        </button>
        <button type="button" className="pill-btn" onClick={() => setShowCustomAdd((v) => !v)}>
          + Custom Task
        </button>
      </div>

      {showCatalogAdd && (
        <div className="day-plan-catalog-add">
          <div className="day-plan-catalog-add-picker">
            <CatalogPicker
              catalog={catalog}
              subcategories={subcategories}
              value={catalogGoodsServiceId}
              onChange={handleCatalogGoodsServiceChange}
              onItemCreated={onCatalogItemCreated}
            />
          </div>
          <div className="day-plan-catalog-add-row">
            <input
              placeholder="Instructions (e.g. PO with food, twice daily)"
              value={catalogInstructions}
              onChange={(e) => setCatalogInstructions(e.target.value)}
            />
            <input
              type="number"
              step="0.01"
              min="0.01"
              className="day-plan-qty-input"
              placeholder="Qty"
              title="Quantity to log per tap (e.g. 0.5 for half a mL)"
              value={catalogQuantity}
              onChange={(e) => setCatalogQuantity(e.target.value)}
            />
          </div>
          <ScheduleControl
            name="catalog-schedule"
            frequency={catalogFrequency}
            onFrequencyChange={setCatalogFrequency}
            billOnce={catalogBillOnce}
            onBillOnceChange={setCatalogBillOnce}
            showBillOnce
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
          <ScheduleControl name="custom-schedule" frequency={customFrequency} onFrequencyChange={setCustomFrequency} />
          <button type="button" onClick={addCustomTask} disabled={!customLabel.trim()}>
            Add
          </button>
        </div>
      )}

      {completedOneTimeItems.length > 0 && (
        <div className="day-plan-completed">
          <p className="visit-meta day-plan-completed-heading">Completed (one-time)</p>
          <div className="day-plan-completed-list">
            {completedOneTimeItems.map((item) => {
              const doneEntries = doneEver(item.id);
              const last = doneEntries[doneEntries.length - 1];
              return (
                <div key={item.id} className="day-plan-completed-item">
                  <span className="day-plan-task-label">{item.label}</span>
                  <span className="day-plan-task-status">
                    ✓ done {formatTime(last.created_at)} · {authorName(last.author_id)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}

const FREQUENCY_OPTIONS = [
  { value: 'once_daily', label: 'Once a day' },
  { value: 'twice_daily', label: 'Morning & afternoon' },
  { value: 'one_time', label: 'One-time only' },
];

// Shared by the catalog-add, custom-add and edit forms: the three
// frequency choices (migration 105) as a connected segmented control, plus
// — for a catalog-linked item — the "Charge once" toggle (migration 127,
// see lib/planItemBilling.js) grouped in the same panel so both read as one
// "how this task bills and schedules" decision instead of two disconnected
// controls.
function ScheduleControl({ name, frequency, onFrequencyChange, billOnce, onBillOnceChange, showBillOnce = false }) {
  return (
    <div className="day-plan-schedule">
      <div className="day-plan-schedule-heading">Schedule</div>
      <div className="day-plan-segmented" role="radiogroup" aria-label={`${name} schedule`}>
        {FREQUENCY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={frequency === opt.value}
            className={`day-plan-segment${frequency === opt.value ? ' active' : ''}`}
            onClick={() => onFrequencyChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {showBillOnce && (
        <>
          <div className="day-plan-schedule-divider" />
          <div className="day-plan-bill-once-row">
            <button
              type="button"
              role="switch"
              aria-checked={billOnce}
              className={`day-plan-toggle${billOnce ? ' on' : ''}`}
              onClick={() => onBillOnceChange(!billOnce)}
            >
              <span className="day-plan-toggle-knob" />
            </button>
            <div>
              <div className="day-plan-bill-once-title">Charge once</div>
              <div className="day-plan-bill-once-help">
                Log every application on the worksheet as usual — only the first one is billed to the invoice.
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
