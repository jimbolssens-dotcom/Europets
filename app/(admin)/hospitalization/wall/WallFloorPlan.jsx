import { byGroup } from '@/app/_components/CageFloorPlan';
import styles from './page.module.css';

// Wall-only geometry. The picker and other hospitalization views keep
// their existing layout. Coordinates here describe the real cage order.
export default function WallFloorPlan({ cages, renderTile }) {
  const lt = [...byGroup(cages, 'long_term')].reverse();
  const isolation = byGroup(cages, 'isolation');
  const postOp = byGroup(cages, 'post_op');
  function cluster(label, items, columns) {
    return <section className={styles.cluster} data-section={label} aria-label={label}>
      <h2 className={styles.clusterLabel}>{label}</h2>
      <div className={styles.clusterGrid} style={{ '--columns': columns }}>
        {items.map(renderTile)}
      </div>
    </section>;
  }
  const isoPositions = ['1 / 1', '2 / 1', '2 / 2'];
  const postPositions = ['1 / 2', '1 / 3', '1 / 4', '2 / 3', '2 / 4'];
  return <div className={styles.floorPlan}>
    <div className={styles.upperRow}>
      {cluster('LT', lt.slice(0, 2), 1)}
      {cluster('Hospitalization Cages', byGroup(cages, 'standard'), 6)}
      {cluster('LT', lt.slice(2), 1)}
    </div>
    <div className={styles.lowerRow}>
      {cluster('Recovery', byGroup(cages, 'recovery'), 2)}
      {cluster('Dog', byGroup(cages, 'dog'), 2)}
      <section className={styles.interlocking} aria-label="Isolation and Post-op">
        <div className={styles.interlockHeaders}>
          <h2 className={styles.isolationLabel}>Isolation</h2>
          <h2 className={styles.postOpLabel}>Post-op</h2>
        </div>
        <div className={styles.interlockGrid}>
          <svg className={styles.sectionOutlines} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path className={styles.isolationOutline} d="M 0 0 H 25 V 50 H 50 V 100 H 0 Z" />
            <path className={styles.postOpOutline} d="M 25 0 H 100 V 100 H 50 V 50 H 25 Z" />
          </svg>
          {isolation.map((cage, index) => <div key={cage.id} className={styles.isoCell} style={{ gridArea: isoPositions[index] }}>{renderTile(cage)}</div>)}
          {postOp.map((cage, index) => <div key={cage.id} className={styles.postCell} style={{ gridArea: postPositions[index] }}>{renderTile(cage)}</div>)}
        </div>
      </section>
    </div>
  </div>;
}
