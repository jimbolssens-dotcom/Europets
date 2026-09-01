// app/hospitalization/cages/page.jsx
// Cage Layout: a visual map of the clinic's physical cages. An occupied
// cage shows who's in it and opens straight to that hospitalization file
// on click; an empty cage offers a dropdown to assign one of the
// currently-admitted-but-unassigned patients to it.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

const GROUP_ORDER = ['standard', 'long_term', 'recovery', 'dog', 'isolation', 'post_op'];
const GROUP_LABELS = {
  standard: 'Hospitalization Cages',
  long_term: 'Long-Term Bungalows',
  recovery: 'Recovery Cages',
  dog: 'Dog Cages',
  isolation: 'Isolation Cages',
  post_op: 'Post-Op Cages',
};

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

  const cagesByGroup = GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    cages: cages.filter((c) => c.group_name === group),
  })).filter((g) => g.cages.length > 0);

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

      {cagesByGroup.map(({ group, label, cages: groupCages }) => (
        <div key={group}>
          <h2>{label}</h2>
          <div className="cage-grid">
            {groupCages.map((cage) => {
              const hosp = occupancy[cage.id];
              return hosp ? (
                <div
                  key={cage.id}
                  className="cage-tile cage-occupied"
                  onClick={() => router.push(`/hospitalization/${hosp.id}`)}
                >
                  <button
                    type="button"
                    className="cage-unassign"
                    title="Free up this cage"
                    onClick={(e) => {
                      e.stopPropagation();
                      unassignCage(hosp.id);
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
              ) : (
                <div key={cage.id} className="cage-tile cage-empty">
                  <div className="cage-tile-header">
                    <span className="cage-name">{cage.name}</span>
                    {cage.is_oxygen_room && <span title="Oxygen room">🫧</span>}
                  </div>
                  <span className="cage-status">Empty</span>
                  {unassignedAdmitted.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) assignCage(cage.id, e.target.value);
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
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
