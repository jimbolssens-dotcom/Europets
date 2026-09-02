// app/_components/CageFloorPlan.jsx
// Arranges a list of cages into clusters that roughly mirror the clinic's
// real floor plan — the 12 standard cages in the middle (2 rows of 6)
// flanked by the long-term bungalows (2 left, 3 right); on the other side
// recovery cages stacked in a column of 4, and to the right of those a
// block with dog cages (2x2) and isolation (2 stacked plus 1 beside) on
// top, post-op cages underneath — so post-op sits tucked under dog/
// isolation instead of sprawling out to the right of them. Doesn't know
// how to render a single cage — pass `renderTile(cage)` for that, so the
// full Cage Layout page, the compact picker (e.g. on Admit Patient), and
// the mobile app can share this same physical layout with completely
// different tiles.

export function byGroup(cages, group) {
  return cages.filter((c) => c.group_name === group).sort((a, b) => a.sort_order - b.sort_order);
}

export default function CageFloorPlan({ cages, renderTile, compact = false }) {
  const standardCages = byGroup(cages, 'standard');
  const ltCages = byGroup(cages, 'long_term');
  const ltLeft = ltCages.slice(0, 2);
  const ltRight = ltCages.slice(2);
  const recoveryCages = byGroup(cages, 'recovery');
  const dogCages = byGroup(cages, 'dog');
  const isoCages = byGroup(cages, 'isolation');
  const postOpCages = byGroup(cages, 'post_op');

  function renderCluster(label, groupCages, cols) {
    if (groupCages.length === 0) return null;
    return (
      <div>
        {label && <h3 className="cage-cluster-label">{label}</h3>}
        <div className="cage-cluster" style={{ '--cols': cols }}>
          {groupCages.map((cage) => renderTile(cage))}
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? 'cage-floorplan cage-floorplan-compact' : 'cage-floorplan'}>
      <div className="floor-plan-row">
        {renderCluster('LT', ltLeft, 1)}
        {renderCluster(compact ? 'Cages' : 'Hospitalization Cages', standardCages, 6)}
        {renderCluster('LT', ltRight, 1)}
      </div>

      <div className="floor-plan-row">
        {renderCluster(compact ? 'Recovery' : 'Recovery Cages', recoveryCages, 1)}
        <div className="cage-lower-block">
          <div className="cage-lower-top-row">
            {renderCluster(compact ? 'Dog' : 'Dog Cages', dogCages, 2)}
            {isoCages.length > 0 && (
              <div>
                <h3 className="cage-cluster-label">{compact ? 'Iso' : 'Isolation Cages'}</h3>
                <div className="cage-cluster-flex">
                  <div className="cage-cluster" style={{ '--cols': 1 }}>
                    {isoCages.slice(0, 2).map((cage) => renderTile(cage))}
                  </div>
                  <div className="cage-cluster" style={{ '--cols': 1 }}>
                    {isoCages.slice(2).map((cage) => renderTile(cage))}
                  </div>
                </div>
              </div>
            )}
          </div>
          {renderCluster(compact ? 'Post-Op' : 'Post-Op Cages', postOpCages, 3)}
        </div>
      </div>
    </div>
  );
}
