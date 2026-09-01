// app/hospitalization/cages/page.jsx
// Cage Layout: a visual map of the clinic's physical cages, arranged to
// roughly match the real floor plan — the 12 standard cages in the
// middle (2 rows of 6) flanked by the long-term bungalows (2 left, 3
// right), and on the other side of the room the recovery cages (stacked
// 4), dog cages (2x2), and isolation cages (2 stacked + 1 beside).
// Post-op cages sit in their own row below. An occupied cage shows who's
// in it and opens straight to that hospitalization file on click; an
// empty cage offers a dropdown to assign one of the currently-
// admitted-but-unassigned patients to it.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

function byGroup(cages, group) {
  return cages.filter((c) => c.group_name === group).sort((a, b) => a.sort_order - b.sort_order);
}

function CageTile({ cage, hosp, unassignedAdmitted, onAssign, onUnassign, onOpen }) {
  if (hosp) {
    return (
      <div className="cage-tile cage-occupied" onClick={() => onOpen(hosp.id)}>
        <button
          type="button"
          className="cage-unassign"
          title="Free up this cage"
          onClick={(e) => {
            e.stopPropagation();
            onUnassign(hosp.id);
          }}
        >
          ×
        </button>
        <div className="cage-tile-header">
          <span className="cage-name">{cage.name}</span>
          {cage.is_oxygen_room && <span title="Oxygen room">🫧</span>}
        </div>
        <div className="cage-patient">{hosp.patients?.name}</div>
        <div className="cage-patient-species">{hosp.patients?.species}</div>
      </div>
    );
  }

  return (
    <div className="cage-tile cage-empty">
      <div className="cage-tile-header">
        <span className="cage-name">{cage.name}</span>
        {cage.is_oxygen_room && <span title="Oxygen room">🫧</span>}
      </div>
      <span className="cage-status">Empty</span>
      {unassignedAdmitted.length > 0 && (
        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) onAssign(cage.id, e.target.value);
          }}
        >
          <option value="">Assign...</option>
          {unassignedAdmitted.map((a) => (
            <option key={a.id} value={a.id}>
              {a.patients?.name} ({a.clients?.full_name})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export default function CageLayoutPage() {
  const router = useRouter();
  const [cages, setCages] = useState([]);
  const [admitted, setAdmitted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAdmitted = () =>
    fetch('/api/hospitalizations?status=admitted')
      .then((res) => res.json())
      .then((data) => setAdmitted(Array.isArray(data) ? data : []));

  useEffect(() => {
    Promise.all([fetch('/api/cages').then((res) => res.json()), loadAdmitted()]).then(
      ([cagesData]) => {
        if (Array.isArray(cagesData)) {
          setCages(cagesData);
        } else {
          setCages([]);
          setError(cagesData?.error || 'Failed to load the cage layout');
        }
        setLoading(false);
      }
    );

    const channel = supabase
      .channel('cage-layout')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitalizations' }, loadAdmitted)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  async function assignCage(cageId, hospitalizationId) {
    setError(null);
    const res = await fetch(`/api/hospitalizations/${hospitalizationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cage_id: cageId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to assign that cage');
      return;
    }
    loadAdmitted();
  }

  async function unassignCage(hospitalizationId) {
    if (!confirm('Free up this cage? The case stays admitted, just unassigned from a cage.')) return;
    await fetch(`/api/hospitalizations/${hospitalizationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cage_id: null }),
    });
    loadAdmitted();
  }

  if (loading) return <p>Loading cage layout...</p>;

  const occupancy = Object.fromEntries(admitted.filter((a) => a.cage_id).map((a) => [a.cage_id, a]));
  const unassignedAdmitted = admitted.filter((a) => !a.cage_id);
  const tileHandlers = {
    unassignedAdmitted,
    onAssign: assignCage,
    onUnassign: unassignCage,
    onOpen: (id) => router.push(`/hospitalization/${id}`),
  };

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
          {groupCages.map((cage) => (
            <CageTile key={cage.id} cage={cage} hosp={occupancy[cage.id]} {...tileHandlers} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p>
        <a href="/hospitalization">&larr; Hospitalization</a>
      </p>
      <h1>Cage Layout</h1>
      <p className="visit-meta">
        Click an occupied cage to open that case&apos;s file. An empty cage can be assigned one of
        the currently admitted, unassigned patients.
      </p>

      {error && <p className="error">{error}</p>}

      <div className="floor-plan-row">
        {renderCluster('LT', ltLeft, 1)}
        {renderCluster('Hospitalization Cages', standardCages, 6)}
        {renderCluster('LT', ltRight, 1)}
      </div>

      <div className="floor-plan-row">
        {renderCluster('Recovery Cages', recoveryCages, 1)}
        {renderCluster('Dog Cages', dogCages, 2)}
        {isoCages.length > 0 && (
          <div>
            <h3 className="cage-cluster-label">Isolation Cages</h3>
            <div className="cage-cluster-flex">
              <div className="cage-cluster" style={{ '--cols': 1 }}>
                {isoCages.slice(0, 2).map((cage) => (
                  <CageTile key={cage.id} cage={cage} hosp={occupancy[cage.id]} {...tileHandlers} />
                ))}
              </div>
              <div className="cage-cluster" style={{ '--cols': 1 }}>
                {isoCages.slice(2).map((cage) => (
                  <CageTile key={cage.id} cage={cage} hosp={occupancy[cage.id]} {...tileHandlers} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {renderCluster('Post-Op Cages', postOpCages, 5)}
    </div>
  );
}
