import { ADMINISTRATION_METHOD_LABELS } from '@/lib/administrationMethods';
import { treatmentColumns } from './treatmentColumns';
import styles from './page.module.css';

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function WallCageTile({ cage, hospitalization, details }) {
  const planItems = details?.planItems || [];
  const todayNotes = details?.todayNotes || [];
  const needsAttention = hospitalization?.update_requested_at || hospitalization?.scheduled_update_overdue;
  const patientName = hospitalization?.patients?.name || 'Unnamed patient';

  function renderTask(item) {
    const done = todayNotes.filter((note) => note.plan_item_ids?.includes(item.id))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const last = done[done.length - 1];
    return <li key={item.id} className={`${styles.task}${done.length ? ` ${styles.done}` : ''}`}>
      <span className={styles.taskLabel}>{item.label}
        {item.administration_method && ` (${ADMINISTRATION_METHOD_LABELS[item.administration_method] || item.administration_method})`}
      </span>
      {item.instructions && <span className={styles.taskMeta}> — {item.instructions}</span>}
      <span className={styles.status}>{done.length
        ? `Done · ${done.length > 1 ? `${done.length}× · ` : ''}last ${formatTime(last.created_at)}${last.staff?.full_name ? ` · ${last.staff.full_name}` : ''}`
        : 'Pending'}</span>
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
        <div className={styles.plan} tabIndex={0} role="region" aria-label={`${cage.name} treatments`}>
          {treatmentColumns(planItems).map((column, index) => <div key={index} className={styles.planColumn}>
            {column.label && <h3 className={styles.columnLabel}>{column.label}</h3>}
            <ul className={styles.taskList}>{column.items.map(renderTask)}</ul>
          </div>)}
        </div>}
    </>}
  </article>;
}

