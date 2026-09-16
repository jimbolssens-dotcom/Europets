'use client';

import { useEffect, useRef, useState } from 'react';
import { ADMINISTRATION_METHOD_LABELS } from '@/lib/administrationMethods';
import { hospitalizationAlarmLevel, cageAlarmClass } from '@/lib/hospitalizationAttention';
import styles from './page.module.css';

// Same tap-to-log-a-worksheet-entry mechanism as DayTreatmentPlan/
// ProcedureChecklist (POST/PATCH .../notes, tagged with plan_item_ids) —
// this tile just triggers it directly from the wall display, for a
// touchscreen-and-mouse computer standing at the cages where opening each
// admission's own page to tick a task would be too slow.
const CONSOLIDATE_WINDOW_MS = 5 * 60 * 1000;

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function WallCageTile({ cage, hospitalization, details, authorId, onLogged }) {
  // Temperature/Weight (see migration 104) need an actual number typed
  // in, not a tap — this tile's tiny grid squares aren't a reasonable
  // place to type one, so those two stay off the wall grid entirely.
  // They're logged from the main hospitalization page or the mobile app
  // instead (see DayTreatmentPlan.jsx); this tile's own "Needs attention"
  // flag still lights up from vitals_weight_overdue, and from
  // scheduled_update_overdue once that's driven by a missed temperature
  // check (see attachScheduledUpdateStatus).
  const planItems = (details?.planItems || []).filter(
    (item) => item.kind !== 'vitals_temperature' && item.kind !== 'vitals_weight'
  );
  const todayNotes = details?.todayNotes || [];
  const alarmLevel = hospitalization ? hospitalizationAlarmLevel(hospitalization) : 'none';
  const needsAttention = alarmLevel !== 'none';
  const patientName = hospitalization?.patients?.name || 'Unnamed patient';

  const [loggingIds, setLoggingIds] = useState(() => new Set());
  const [error, setError] = useState(null);
  const lastNoteRef = useRef(null);
  const logQueueRef = useRef(Promise.resolve());

  // A different admission taking this cage invalidates whatever note this
  // tile was tracking as mergeable.
  useEffect(() => {
    lastNoteRef.current = null;
  }, [hospitalization?.id]);

  function taskLine(item) {
    return item.instructions ? `${item.label} — ${item.instructions}` : item.label;
  }

  // Same consolidation as DayTreatmentPlan/ProcedureChecklist: a tap
  // within CONSOLIDATE_WINDOW_MS of the same author's last plan-tap entry
  // merges into it instead of creating a new worksheet row, so ticking
  // off several tasks during a round lands as one entry.
  function findMergeableNote() {
    const now = Date.now();
    const isValid = (n) =>
      n?.plan_item_ids?.length > 0 &&
      (n.author_id || null) === (authorId || null) &&
      now - new Date(n.created_at).getTime() < CONSOLIDATE_WINDOW_MS;

    if (isValid(lastNoteRef.current)) return lastNoteRef.current;
    return todayNotes.filter(isValid).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  }

  // Queued the same way as DayTreatmentPlan/ProcedureChecklist, so two
  // taps on this tile fired close together still consolidate correctly
  // instead of racing each other. onLogged (the wall's own loadWall)
  // refreshes this tile's todayNotes as soon as the tap resolves, rather
  // than waiting on the next 30s poll or the realtime subscription.
  function logTask(item) {
    if (!hospitalization) return;
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
        onLogged?.();
      }
    };

    logQueueRef.current = logQueueRef.current.then(run, run);
  }

  async function createTaskNote(item) {
    const res = await fetch(`/api/hospitalizations/${hospitalization.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_id: authorId || null,
        note_date: todayISODate(),
        notes: taskLine(item),
        plan_item_ids: [item.id],
        treatment_items: item.goods_service_id
          ? [{ goods_service_id: item.goods_service_id, quantity: item.quantity || 1, administration_method: item.administration_method }]
          : [],
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to log task');
    lastNoteRef.current = data;
  }

  async function mergeTaskIntoNote(note, item) {
    const patchRes = await fetch(`/api/hospitalizations/${hospitalization.id}/notes/${note.id}`, {
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
      }),
    });
    if (!itemRes.ok) {
      const data = await itemRes.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to log task');
    }
  }

  // Every treatment-plan item gets its own cell in a grid sized to the
  // item count, so the whole day's plan is visible on the tile at once —
  // seeing what's still pending at a glance matters more here than
  // legible per-item text, which is why detail moves to the tooltip.
  const columns = Math.max(1, Math.ceil(Math.sqrt(planItems.length)));
  const rows = Math.max(1, Math.ceil(planItems.length / columns));

  function renderTask(item) {
    const done = todayNotes.filter((note) => note.plan_item_ids?.includes(item.id))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const last = done[done.length - 1];
    const logging = loggingIds.has(item.id);
    const methodLabel = item.administration_method && (ADMINISTRATION_METHOD_LABELS[item.administration_method] || item.administration_method);
    const statusText = logging
      ? 'Logging…'
      : done.length
        ? `Done${done.length > 1 ? ` ${done.length}×` : ''} · last ${formatTime(last.created_at)}${last.staff?.full_name ? ` · ${last.staff.full_name}` : ''}`
        : 'Tap to log — Pending';
    const title = [item.label, methodLabel, item.instructions, statusText].filter(Boolean).join(' — ');
    return <li key={item.id} className={styles.task}>
      <button
        type="button"
        className={`${styles.taskButton}${done.length ? ` ${styles.done}` : ''}${logging ? ` ${styles.logging}` : ''}`}
        onClick={() => logTask(item)}
        disabled={logging}
        title={title}
      >
        <span className={styles.taskLabel}>{item.label}</span>
      </button>
    </li>;
  }

  return <article className={`${styles.tile}${!hospitalization ? ` ${styles.empty}` : ''}${needsAttention ? ` ${styles.attention} ${cageAlarmClass(alarmLevel)}` : ''}`}
    aria-label={`${cage.name} · ${hospitalization ? patientName : 'Empty'}${needsAttention ? ' · Needs attention' : ''}`}>
    <div className={styles.tileHeader}>
      <span className={styles.cageName}>{cage.name}</span>
      {hospitalization && <span className={styles.patient}>{patientName}</span>}
    </div>
    {!hospitalization ? <span className={styles.noPlan}>Empty</span> : <>
      {needsAttention && <span className={styles.attentionLabel}>Needs attention</span>}
      {error && <span role="alert" className={styles.error}>{error}</span>}
      {details?.error ? <span role="status" className={styles.error}>Treatment details unavailable</span> : planItems.length === 0 ?
        <div className={styles.noPlan}>No treatment plan entered.</div> :
        <ul className={styles.plan} style={{ '--cols': columns, '--rows': rows }} role="region" aria-label={`${cage.name} treatments`}>
          {planItems.map(renderTask)}
        </ul>}
    </>}
  </article>;
}
