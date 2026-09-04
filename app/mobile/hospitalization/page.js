// app/mobile/hospitalization/page.js
// The mobile cage layout is deliberately its own arrangement, not a
// resized copy of the desktop Cage Layout page (see CageFloorPlan.jsx
// for that one) — two vertical columns side by side, sized to fit a
// portrait phone's width with no horizontal scrolling:
//   left column, top to bottom:  Recovery -> Isolation -> Dog -> Post-Op
//   right column, top to bottom: LT (4-5) -> Hospitalization (1-12) -> LT (1-3)
// Every cluster keeps its own cage grouping/count; only where the
// clusters sit relative to each other changes. Tile text stays upright
// throughout — no CSS rotation. No drag/assign here; tap an occupied
// cage straight into recording.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { byGroup } from '@/app/_components/CageFloorPlan';

function MobileCageTile({ cage, hosp }) {
  if (hosp) {
    return (
      <a
        href={`/mobile/hospitalization/${hosp.id}`}
        className={`cage-tile cage-tile-mobile-occupied${hosp.update_requested_at ? ' cage-update-requested' : ''}`}
      >
        <div className="cage-tile-header">
          <span className="cage-name">{cage.name}</span>
          {hosp.update_requested_at && <span title="Owner requested an update">🔔</span>}
          {cage.is_oxygen_room && <span title="Oxygen room">🫧</span>}
        </div>
        <div className="cage-patient">{hosp.patients?.name}</div>
      </a>
    );
  }
  return (
    <div className={`cage-tile cage-empty cage-group-${cage.group_name}`}>
      <div className="cage-tile-header">
        <span className="cage-name">{cage.name}</span>
        {cage.is_oxygen_room && <span title="Oxygen room">🫧</span>}
      </div>
      <span className="cage-status">Empty</span>
    </div>
  );
}

function Cluster({ label, cages, cols, renderTile }) {
  if (cages.length === 0) return null;
  return (
    <div>
      <h3 className="cage-cluster-label">{label}</h3>
      <div className="cage-cluster" style={{ '--cols': cols }}>
        {cages.map((cage) => renderTile(cage))}
      </div>
    </div>
  );
}

function IsoCluster({ cages, renderTile }) {
  if (cages.length === 0) return null;
  return (
    <div>
      <h3 className="cage-cluster-label">Isolation Cages</h3>
      <div className="cage-cluster-flex">
        <div className="cage-cluster" style={{ '--cols': 1 }}>
          {cages.slice(0, 2).map((cage) => renderTile(cage))}
        </div>
        <div className="cage-cluster" style={{ '--cols': 1 }}>
          {cages.slice(2).map((cage) => renderTile(cage))}
        </div>
      </div>
    </div>
  );
}

// The 12 Hospitalization Cages render as a 2-column grid that fills
// row-major (left, right, left, right...) — see .cage-cluster in
// globals.css. byGroup already sorts them by sort_order (Cage 1-12 in
// order), which would put 1,3,5,7,9,11 down the left column and
// 2,4,6,8,10,12 down the right. Staff want it the other way in spirit but
// split differently: the left column reading 7-12 top to bottom and the
// right column reading 1-6 top to bottom. This only reorders how they're
// sequenced into this mobile grid — sort_order itself (and desktop's own,
// differently-shaped arrangement of the same cages) is untouched.
function reorderForMobileHospitalizationCages(cages) {
  const half = Math.ceil(cages.length / 2);
  const firstHalf = cages.slice(0, half); // Cage 1-6
  const secondHalf = cages.slice(half); // Cage 7-12
  const reordered = [];
  for (let i = 0; i < half; i++) {
    if (secondHalf[i]) reordered.push(secondHalf[i]);
    if (firstHalf[i]) reordered.push(firstHalf[i]);
  }
  return reordered;
}

function MobileCageColumns({ cages, renderTile }) {
  const standardCages = reorderForMobileHospitalizationCages(byGroup(cages, 'standard'));
  const ltCages = byGroup(cages, 'long_term');
  const ltLower = ltCages.slice(0, 3); // LT 1-3, at the bottom of the right column
  const ltUpper = ltCages.slice(3); // LT 4-5, at the top of the right column
  const recoveryCages = byGroup(cages, 'recovery');
  const dogCages = byGroup(cages, 'dog');
  const isoCages = byGroup(cages, 'isolation');
  const postOpCages = byGroup(cages, 'post_op');

  return (
    <div className="mobile-cage-columns">
      <div className="mobile-cage-col">
        <Cluster label="Recovery Cages" cages={recoveryCages} cols={1} renderTile={renderTile} />
        <IsoCluster cages={isoCages} renderTile={renderTile} />
        <Cluster label="Dog Cages" cages={dogCages} cols={2} renderTile={renderTile} />
        <Cluster label="Post-Op Cages" cages={postOpCages} cols={2} renderTile={renderTile} />
      </div>
      <div className="mobile-cage-col mobile-cage-col-right">
        <Cluster label="LT" cages={ltUpper} cols={ltUpper.length} renderTile={renderTile} />
        <Cluster label="Hospitalization Cages" cages={standardCages} cols={2} renderTile={renderTile} />
        <Cluster label="LT" cages={ltLower} cols={ltLower.length} renderTile={renderTile} />
      </div>
    </div>
  );
}

export default function MobileHospitalizationListPage() {
  const [cages, setCages] = useState([]);
  const [admitted, setAdmitted] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAdmitted = () =>
    fetch('/api/hospitalizations?status=admitted')
      .then((res) => res.json())
      .then((data) => setAdmitted(Array.isArray(data) ? data : []));

  useEffect(() => {
    Promise.all([fetch('/api/cages').then((res) => res.json()), loadAdmitted()]).then(([cagesData]) => {
      setCages(Array.isArray(cagesData) ? cagesData : []);
      setLoading(false);
    });

    const channel = supabase
      .channel('mobile-cage-layout')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitalizations' }, loadAdmitted)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const occupancy = Object.fromEntries(admitted.filter((a) => a.cage_id).map((a) => [a.cage_id, a]));

  return (
    <div className="mobile-page">
      <a href="/mobile" className="mobile-back">
        &larr; Record
      </a>
      <h1>Hospitalization</h1>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <MobileCageColumns
          cages={cages}
          renderTile={(cage) => <MobileCageTile key={cage.id} cage={cage} hosp={occupancy[cage.id]} />}
        />
      )}
    </div>
  );
}
