import { ADMINISTRATION_METHOD_LABELS } from '@/lib/administrationMethods';
import styles from './page.module.css';

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function WallCageTile({ cage, hospitalization, details }) {
  const planItems = details?.planItems || [];
  const todayNotes = details?.todayNotes || [];
  const needsAttention = hospitalization?.update_requested_at || hospitalization?.scheduled_update_overdue;
  const patientName = hospitalization?.patients?.name || 'Unnamed patient';

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
    const methodLabel = item.administration_method && (ADMINISTRATION_METHOD_LABELS[item.administration_method] || item.administration_method);
    const statusText = done.length
      ? `Done${done.length > 1 ? ` ${done.length}×` : ''} · last ${formatTime(last.created_at)}${last.staff?.full_name ? ` · ${last.staff.full_name}` : ''}`
      : 'Pending';
    const title = [item.label, methodLabel, item.instructions, statusText].filter(Boolean).join(' — ');
    return <li key={item.id} className={`${styles.task}${done.length ? ` ${styles.done}` : ''}`} title={title}>
      <span className={styles.taskLabel}>{item.label}</span>
    </li>;
  }

  return <article className={`${styles.tile}${!hospitalization ? ` ${styles.empty}` : ''}${needsAttention ? ` ${styles.attention} cage-update-requested` : ''}`}
    aria-label={`${cage.name} · ${hospitalization ? patientName : 'Empty'}${needsAttention ? ' · Needs attention' : ''}`}>
    <div className={styles.tileHeader}>
      <span className={styles.cageName}>{cage.name}</span>
      {hospitalization && <span className={styles.patient}>{patientName}</span>}
    </div>
    {!hospitalization ? <span className={styles.noPlan}>Empty</span> : <>
      {needsAttention && <span className={styles.attentionLabel}>Needs attention</span>}
      {details?.error ? <span role="status" className={styles.error}>Treatment details unavailable</span> : planItems.length === 0 ?
        <div className={styles.noPlan}>No treatment plan entered.</div> :
        <ul className={styles.plan} style={{ '--cols': columns, '--rows': rows }} role="region" aria-label={`${cage.name} treatments`}>
          {planItems.map(renderTask)}
        </ul>}
    </>}
  </article>;
}
