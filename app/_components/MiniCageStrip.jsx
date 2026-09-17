// app/_components/MiniCageStrip.jsx
// A compact, read-only echo of the real Cage Layout (app/(admin)/hospitalization/
// page.jsx) — just the Hospitalization Cages block and its flanking LT
// cages, in the exact same left/middle/right arrangement (same byGroup
// helper, same LT-reversed split), so staff looking at one patient's file
// can jump straight to the next one's without going back to the full cage
// board. No drag-to-move, no assign dropdown, no oxygen-room/alarm icons —
// just "who's where," click to open.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { byGroup } from './CageFloorPlan';

function MiniTile({ cage, hosp, isCurrent }) {
  if (!hosp) {
    return (
      <div className="mini-cage-tile mini-cage-empty">
        <span className="mini-cage-name">{cage.name}</span>
      </div>
    );
  }
  return (
    <a href={`/hospitalization/${hosp.id}`} className={`mini-cage-tile mini-cage-occupied${isCurrent ? ' mini-cage-current' : ''}`}>
      <span className="mini-cage-name">{cage.name}</span>
      <span className="mini-cage-patient">
        {hosp.patients?.name}
        {hosp.patients?.patient_number ? ` (#${hosp.patients.patient_number})` : ''}
      </span>
    </a>
  );
}

export default function MiniCageStrip({ currentHospitalizationId }) {
  const [cages, setCages] = useState([]);
  const [occupancy, setOccupancy] = useState({});
  const [loaded, setLoaded] = useState(false);

  const load = () =>
    Promise.all([
      fetch('/api/cages').then((res) => res.json()),
      fetch('/api/hospitalizations?status=admitted').then((res) => res.json()),
    ]).then(([cagesData, admissions]) => {
      setCages(Array.isArray(cagesData) ? cagesData : []);
      const occ = {};
      (Array.isArray(admissions) ? admissions : []).forEach((a) => {
        if (a.cage_id) occ[a.cage_id] = a;
      });
      setOccupancy(occ);
      setLoaded(true);
    });

  useEffect(() => {
    load();
    const channel = supabase
      .channel('mini-cage-strip')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitalizations' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loaded || cages.length === 0) return null;

  const ltCages = [...byGroup(cages, 'long_term')].reverse();
  const ltLeft = ltCages.slice(0, 2);
  const ltRight = ltCages.slice(2);
  const standardCages = byGroup(cages, 'standard');

  return (
    <div className="mini-cage-strip">
      <div className="mini-cage-col">
        {ltLeft.map((cage) => (
          <MiniTile key={cage.id} cage={cage} hosp={occupancy[cage.id]} isCurrent={occupancy[cage.id]?.id === currentHospitalizationId} />
        ))}
      </div>
      <div className="mini-cage-grid">
        {standardCages.map((cage) => (
          <MiniTile key={cage.id} cage={cage} hosp={occupancy[cage.id]} isCurrent={occupancy[cage.id]?.id === currentHospitalizationId} />
        ))}
      </div>
      <div className="mini-cage-col">
        {ltRight.map((cage) => (
          <MiniTile key={cage.id} cage={cage} hosp={occupancy[cage.id]} isCurrent={occupancy[cage.id]?.id === currentHospitalizationId} />
        ))}
      </div>
    </div>
  );
}
