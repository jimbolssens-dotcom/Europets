// app/mobile/hospitalization/page.js
// The full cage layout, identical to the desktop Cage Layout page's own
// arrangement (same clusters, same columns, same per-group colors) —
// meant to be viewed with the phone turned to landscape, not reflowed
// into a portrait grid. No drag/assign here; tap an occupied cage
// straight into recording.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import CageFloorPlan from '@/app/_components/CageFloorPlan';

function MobileCageTile({ cage, hosp }) {
  if (hosp) {
    return (
      <a href={`/mobile/hospitalization/${hosp.id}`} className="cage-tile cage-tile-mobile-occupied">
        <div className="cage-tile-header">
          <span className="cage-name">{cage.name}</span>
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
    <div className="mobile-page mobile-page-wide">
      <a href="/mobile" className="mobile-back">
        &larr; Record
      </a>
      <h1>Hospitalization</h1>
      <p className="mobile-hint">Turn your phone sideways for the full layout.</p>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <CageFloorPlan
          cages={cages}
          renderTile={(cage) => <MobileCageTile key={cage.id} cage={cage} hosp={occupancy[cage.id]} />}
        />
      )}
    </div>
  );
}
