// app/_components/MiniCageStrip.jsx
// An icon-sized, text-free echo of the real Cage Layout (app/(admin)/
// hospitalization/page.jsx) — just the Hospitalization Cages block and its
// flanking LT cages, one tiny dot per cage in the exact same left/middle/
// right arrangement (same byGroup helper, same LT-reversed split). Sits
// inline next to the patient's name/vitals sparklines in the page header —
// small enough to add nothing to that row's height — so staff can jump
// straight to the next occupied cage's patient without leaving to the full
// cage board. Hover a dot for who's in it; click an occupied one to open it.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { byGroup } from './CageFloorPlan';

function dotTitle(cage, hosp) {
  if (!hosp) return `${cage.name}: empty`;
  const patientLabel = hosp.patients?.patient_number ? `${hosp.patients?.name} (#${hosp.patients.patient_number})` : hosp.patients?.name;
  return `${cage.name}: ${patientLabel}`;
}

function Dot({ cage, hosp, isCurrent }) {
  const className = `mini-cage-icon-dot${hosp ? ' occ' : ''}${isCurrent ? ' current' : ''}`;
  if (!hosp) return <div className={className} title={dotTitle(cage, hosp)} />;
  return <a href={`/hospitalization/${hosp.id}`} className={className} title={dotTitle(cage, hosp)} />;
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
    <div className="mini-cage-icon" title="Cage layout">
      <div className="mini-cage-icon-col">
        {ltLeft.map((cage) => (
          <Dot key={cage.id} cage={cage} hosp={occupancy[cage.id]} isCurrent={occupancy[cage.id]?.id === currentHospitalizationId} />
        ))}
      </div>
      <div className="mini-cage-icon-grid">
        {standardCages.map((cage) => (
          <Dot key={cage.id} cage={cage} hosp={occupancy[cage.id]} isCurrent={occupancy[cage.id]?.id === currentHospitalizationId} />
        ))}
      </div>
      <div className="mini-cage-icon-col">
        {ltRight.map((cage) => (
          <Dot key={cage.id} cage={cage} hosp={occupancy[cage.id]} isCurrent={occupancy[cage.id]?.id === currentHospitalizationId} />
        ))}
      </div>
    </div>
  );
}
