import { ADMINISTRATION_METHOD_LABELS } from '@/lib/administrationMethods';
import styles from './page.module.css';

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Same "fit the whole checklist without scrolling" grid as the
// Hospital Wall's cage tiles (see app/(admin)/hospitalization/wall) —
// a same-day case's checklist is the same underlying plan-items/notes
// data, just without a physical cage to key off of.
export default function DayProcedureWallCard({ dayProcedure, details }) {
  const planItems = details?.planItems || [];
  const todayNotes = details?.todayNotes || [];
  const patientName = dayProcedure.patients?.name || 'Unnamed patient';
  const doneCount = planItems.filter((item) => todayNotes.some((n) => n.plan_item_ids?.includes(item.id))).length;

  const columns = Math.max(1, Math.ceil(Math.sqrt(planItems.length)));
  const rows = Math.max(1, Math.ceil(planItems.length / columns));

  function renderTask(item) {
    const done = todayNotes.filter((note) => note.plan_item_ids?.includes(item.id))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const last = done[done.length - 1];
    const methodLabel = item.administration_method && (ADMINISTRATION_METHOD_LABELS[item.administration_method] || item.administration_method);
    const statusText = done.length
      ? `Done${done.length > 1 ? ` ${done.length}×` : ''} · last ${formatTime(last.created_at)}${last.staff?.full_name ? ` · ${last.staff.full_name}` : ''}`
      : 'Pending';
    const title = [item.label, methodLabel, item.instructions, statusText].filter(Boolean).join(' — ');
    return <li key={item.id} className={`${styles.task}${done.length ? ` ${styles.done}` : ''}`} title={title}>
      <span className={styles.taskLabel}>{item.label}</span>
    </li>;
  }

  return <article className={styles.tile} aria-label={`${patientName} · ${doneCount}/${planItems.length} done`}>
    <div className={styles.tileHeader}>
      <span className={styles.patient}>{patientName}</span>
      <span className={styles.meta}>{dayProcedure.reason || dayProcedure.rooms?.name || ''}</span>
      {planItems.length > 0 && <span className={styles.progress}>{doneCount}/{planItems.length}</span>}
    </div>
    {details?.error ? <span role="status" className={styles.error}>Checklist unavailable</span> : planItems.length === 0 ?
      <div className={styles.noPlan}>No checklist entered yet.</div> :
      <ul className={styles.plan} style={{ '--cols': columns, '--rows': rows }} role="region" aria-label={`${patientName} checklist`}>
        {planItems.map(renderTask)}
      </ul>}
  </article>;
}
