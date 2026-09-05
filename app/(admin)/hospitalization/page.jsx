// app/hospitalization/page.jsx
// Hospitalization home: the cage floor plan is the landing view (see
// CageTile below — same drag-to-move/tap-to-open/assign-via-dropdown
// behavior the old standalone Cage Layout page had, just relocated
// here), with a tab across to the admissions list (Currently Admitted +
// Recently Discharged) and a slide-over for a standalone admission —
// same "Admit Patient" form as before, just out of the page flow so it's
// reachable from either tab without losing your place. Tabs use the same
// mechanism/styling as the Consult page (app/(admin)/consults/[id]).
//
// Most admissions start from a consult's "Admit to Hospitalization"
// button instead of this page's own form, which is for a standalone
// admission (a patient already in-house).

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import CageFloorPlan from '@/app/_components/CageFloorPlan';
import CagePicker from '@/app/_components/CagePicker';
import SearchSelect from '@/app/_components/SearchSelect';
import { formatDateTime } from '@/lib/formatTimestamp';
import { isWithinOfficeHours } from '@/lib/officeHours';

const DRAG_THRESHOLD = 6;
const emptyAdmitForm = { client_id: '', patient_id: '', cage_id: '', reason: '' };

// The cage tile's tooltip when an owner is waiting on an update — names
// when the request came in (and flags it if that was outside office
// hours) so staff can tell a fresh request from one that's been sitting
// since overnight.
function updateRequestTooltip(hosp) {
  const when = formatDateTime(hosp.update_requested_at);
  const afterHours = !isWithinOfficeHours(new Date(hosp.update_requested_at));
  return `${when}${afterHours ? ' (after hours)' : ''}${hosp.update_request_message ? `: "${hosp.update_request_message}"` : ''}`;
}

function CageTile({ cage, hosp, unassignedAdmitted, onAssign, onUnassign, onDragStart, dragSourceId, dropTargetId }) {
  const isDragSource = dragSourceId === cage.id;
  const isDropTarget = dropTargetId === cage.id;

  if (hosp) {
    return (
      <div
        className={[
          'cage-tile',
          'cage-occupied',
          hosp.update_requested_at ? 'cage-update-requested' : '',
          isDragSource ? 'cage-drag-source' : '',
          isDropTarget ? 'cage-drop-target' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-cage-id={cage.id}
        onPointerDown={(e) => onDragStart(e, cage, hosp)}
        title={
          hosp.update_requested_at
            ? `${hosp.patients?.name}'s owner is waiting for an update (requested ${updateRequestTooltip(hosp)}) — drag to move, or tap to open`
            : 'Drag to move to another cage, or tap to open'
        }
      >
        <button
          type="button"
          className="cage-unassign"
          title="Free up this cage"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onUnassign(hosp.id);
          }}
        >
          ×
        </button>
        <div className="cage-tile-header">
          <span className="cage-name">{cage.name}</span>
          {hosp.update_requested_at && (
            <span title={`Owner requested an update ${updateRequestTooltip(hosp)}`}>🔔</span>
          )}
          {cage.is_oxygen_room && <span title="Oxygen room">🫧</span>}
        </div>
        <div className="cage-patient">{hosp.patients?.name}</div>
        <div className="cage-patient-species">{hosp.patients?.species}</div>
      </div>
    );
  }

  return (
    <div
      className={`cage-tile cage-empty cage-group-${cage.group_name}${isDropTarget ? ' cage-drop-target' : ''}`}
      data-cage-id={cage.id}
    >
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

export default function HospitalizationPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('layout');
  const [admissions, setAdmissions] = useState([]);
  const [cages, setCages] = useState([]);
  const [clients, setClients] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drag, setDrag] = useState(null); // { hospId, patientName, fromCageId, x, y, moved, overCageId }
  const dragRef = useRef(null); // mirrors `drag` for use inside event handlers without stale closures

  const [admitOpen, setAdmitOpen] = useState(false);
  const [admitForm, setAdmitForm] = useState(emptyAdmitForm);
  const [admitSubmitting, setAdmitSubmitting] = useState(false);
  const [admitError, setAdmitError] = useState(null);

  const loadAdmissions = () =>
    fetch('/api/hospitalizations')
      .then((res) => res.json())
      .then((data) => {
        setAdmissions(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load the hospitalization list');
        setLoading(false);
      });

  useEffect(() => {
    loadAdmissions();
    Promise.all([
      fetch('/api/cages').then((res) => res.json()),
      fetch('/api/clients').then((res) => res.json()),
      fetch('/api/patients').then((res) => res.json()),
    ]).then(([cagesData, clientsData, patientsData]) => {
      if (Array.isArray(cagesData)) {
        setCages(cagesData);
      } else {
        setCages([]);
        setError(cagesData?.error || 'Failed to load the cage layout');
      }
      setClients(Array.isArray(clientsData) ? clientsData : []);
      setPatients(Array.isArray(patientsData) ? patientsData : []);
    });

    const channel = supabase
      .channel('hospitalizations-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitalizations' }, () =>
        loadAdmissions()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function patchHosp(id, body) {
    const res = await fetch(`/api/hospitalizations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return { ok: res.ok, error: data.error };
  }

  async function assignCage(cageId, hospitalizationId) {
    setError(null);
    const result = await patchHosp(hospitalizationId, { cage_id: cageId });
    if (!result.ok) {
      setError(result.error || 'Failed to assign that cage');
      return;
    }
    loadAdmissions();
  }

  async function unassignCage(hospitalizationId) {
    if (!confirm('Free up this cage? The case stays admitted, just unassigned from a cage.')) return;
    await patchHosp(hospitalizationId, { cage_id: null });
    loadAdmissions();
  }

  // Moving onto an empty cage is one update. Moving onto an occupied one
  // swaps the two — done as three sequential updates (vacate the source,
  // move the occupant into it, then move the dragged patient into their
  // old spot) so the partial unique index on (cage_id) for admitted cases
  // never sees two rows pointing at the same cage at once.
  async function dropOnCage(hospId, fromCageId, toCageId, occupancy) {
    setError(null);
    const targetHosp = occupancy[toCageId];

    if (!targetHosp) {
      const result = await patchHosp(hospId, { cage_id: toCageId });
      if (!result.ok) setError(result.error || 'Failed to move that patient');
      loadAdmissions();
      return;
    }

    const vacate = await patchHosp(hospId, { cage_id: null });
    if (!vacate.ok) {
      setError(vacate.error || 'Failed to move that patient');
      return;
    }
    const moveOther = await patchHosp(targetHosp.id, { cage_id: fromCageId });
    if (!moveOther.ok) {
      await patchHosp(hospId, { cage_id: fromCageId }); // best-effort revert
      setError(moveOther.error || 'Failed to swap those patients');
      loadAdmissions();
      return;
    }
    const moveDragged = await patchHosp(hospId, { cage_id: toCageId });
    if (!moveDragged.ok) setError(moveDragged.error || 'Failed to swap those patients');
    loadAdmissions();
  }

  function handleDragStart(e, cage, hosp, occupancy) {
    if (e.target.closest('button, select')) return; // let the unassign button handle its own click
    e.currentTarget.setPointerCapture(e.pointerId);
    const state = {
      pointerId: e.pointerId,
      hospId: hosp.id,
      patientName: hosp.patients?.name,
      fromCageId: cage.id,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      overCageId: null,
      occupancy,
    };
    dragRef.current = state;
    setDrag(state);

    const el = e.currentTarget;
    function onMove(ev) {
      const s = dragRef.current;
      if (!s) return;
      const moved = s.moved || Math.hypot(ev.clientX - s.startX, ev.clientY - s.startY) > DRAG_THRESHOLD;
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const tileEl = under?.closest('[data-cage-id]');
      const overCageId = tileEl ? tileEl.getAttribute('data-cage-id') : null;
      const next = { ...s, x: ev.clientX, y: ev.clientY, moved, overCageId };
      dragRef.current = next;
      setDrag(next);
    }
    function onUp() {
      const s = dragRef.current;
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      dragRef.current = null;
      setDrag(null);
      if (!s) return;
      if (!s.moved) {
        router.push(`/hospitalization/${s.hospId}`);
        return;
      }
      if (s.overCageId && s.overCageId !== s.fromCageId) {
        dropOnCage(s.hospId, s.fromCageId, s.overCageId, s.occupancy);
      }
    }
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }

  function openAdmit() {
    setAdmitForm(emptyAdmitForm);
    setAdmitError(null);
    setAdmitOpen(true);
  }

  async function handleAdmitSubmit(e) {
    e.preventDefault();
    if (!admitForm.client_id || !admitForm.patient_id) {
      setAdmitError('Select an owner and patient');
      return;
    }
    setAdmitSubmitting(true);
    setAdmitError(null);

    const res = await fetch('/api/hospitalizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(admitForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setAdmitError(data.error || 'Failed to admit patient');
    } else {
      setAdmitOpen(false);
      loadAdmissions();
    }
    setAdmitSubmitting(false);
  }

  if (loading) return <p>Loading hospitalization...</p>;

  const admitted = admissions.filter((a) => a.status === 'admitted');
  const discharged = admissions.filter((a) => a.status === 'discharged').slice(0, 20);
  const patientsForClient = patients.filter((p) => p.client_id === admitForm.client_id);
  const occupancy = Object.fromEntries(admitted.filter((a) => a.cage_id).map((a) => [a.cage_id, a]));
  const unassignedAdmitted = admitted.filter((a) => !a.cage_id);
  const occupiedCageIds = new Set(Object.keys(occupancy));
  const attentionCount = admitted.filter((a) => a.update_requested_at).length;

  const tileHandlers = {
    unassignedAdmitted,
    onAssign: assignCage,
    onUnassign: unassignCage,
    onDragStart: (e, cage, hosp) => handleDragStart(e, cage, hosp, occupancy),
    dragSourceId: drag?.moved ? drag.fromCageId : null,
    dropTargetId: drag?.moved ? drag.overCageId : null,
  };

  return (
    <div>
      <div className="page-header">
        <h1>Hospitalization</h1>
        <button type="button" className="button-link" onClick={openAdmit}>
          ✚ Admit Patient
        </button>
      </div>

      <div className="hosp-stat-strip">
        <div className="hosp-stat hosp-stat-occupied">
          <span className="n">{occupiedCageIds.size}</span>
          <span className="l">Occupied</span>
        </div>
        <div className="hosp-stat">
          <span className="n">{cages.length - occupiedCageIds.size}</span>
          <span className="l">Empty</span>
        </div>
        <div className="hosp-stat">
          <span className="n">{cages.length}</span>
          <span className="l">Total cages</span>
        </div>
        <div className="hosp-stat hosp-stat-attention">
          <span className="n">{attentionCount}</span>
          <span className="l">🔔 Need attention</span>
        </div>
      </div>

      <div className="consult-tabs">
        <button
          type="button"
          className={`consult-tab ${activeTab === 'layout' ? 'active' : ''}`}
          onClick={() => setActiveTab('layout')}
        >
          🗺️ Cage Layout
        </button>
        <button
          type="button"
          className={`consult-tab ${activeTab === 'list' ? 'active' : ''}`}
          onClick={() => setActiveTab('list')}
        >
          📋 All Admissions ({admitted.length})
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div hidden={activeTab !== 'layout'}>
        <p className="visit-meta">
          Tap or click an occupied cage to open that case&apos;s file, or drag it onto another cage
          to move that patient there (drag onto an occupied cage to swap the two). An empty cage
          can also be assigned one of the currently admitted, unassigned patients from its
          dropdown.
        </p>

        <CageFloorPlan
          cages={cages}
          renderTile={(cage) => (
            <CageTile key={cage.id} cage={cage} hosp={occupancy[cage.id]} {...tileHandlers} />
          )}
        />

        {drag?.moved && (
          <div className="cage-drag-ghost" style={{ left: drag.x, top: drag.y }}>
            {drag.patientName}
          </div>
        )}
      </div>

      <div hidden={activeTab !== 'list'}>
        <h2>Currently Admitted</h2>
        {admitted.length === 0 ? (
          <p>No patients currently admitted.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Owner</th>
                <th>Cage</th>
                <th>Reason</th>
                <th>Admitted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {admitted.map((a) => (
                <tr key={a.id}>
                  <td>{a.patients?.name}</td>
                  <td>{a.clients?.full_name}</td>
                  <td>{a.cages?.name || '—'}</td>
                  <td>{a.reason || '—'}</td>
                  <td>{new Date(a.admitted_at).toLocaleString()}</td>
                  <td>
                    <a href={`/hospitalization/${a.id}`}>Open</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2>Recently Discharged</h2>
        {discharged.length === 0 ? (
          <p>No discharges yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Owner</th>
                <th>Discharged</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {discharged.map((a) => (
                <tr key={a.id}>
                  <td>{a.patients?.name}</td>
                  <td>{a.clients?.full_name}</td>
                  <td>{a.discharged_at ? new Date(a.discharged_at).toLocaleString() : '—'}</td>
                  <td>
                    <a href={`/hospitalization/${a.id}`}>Open</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {admitOpen && (
        <>
          <div className="admit-scrim" onClick={() => setAdmitOpen(false)} />
          <div className="admit-panel">
            <div className="admit-panel-header">
              <h2>Admit Patient</h2>
              <button type="button" className="admit-panel-close" onClick={() => setAdmitOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <form className="card admit-patient-form" onSubmit={handleAdmitSubmit}>
              <p>
                Usually started from a consult&apos;s &quot;Admit to Hospitalization&quot; button —
                use this for a standalone admission.
              </p>
              {admitError && <p className="error">{admitError}</p>}
              <div className="admit-patient-row">
                <div className="admit-patient-fields">
                  <SearchSelect
                    items={clients}
                    value={admitForm.client_id}
                    onChange={(client_id) => setAdmitForm({ ...admitForm, client_id, patient_id: '' })}
                    getLabel={(c) => c.full_name}
                    getSubLabel={(c) => c.phone}
                    placeholder="Select owner..."
                  />
                  <SearchSelect
                    items={patientsForClient}
                    value={admitForm.patient_id}
                    onChange={(patient_id) => setAdmitForm({ ...admitForm, patient_id })}
                    getLabel={(p) => p.name}
                    getSubLabel={(p) => p.species}
                    placeholder="Select patient..."
                    disabled={!admitForm.client_id}
                  />
                  <input
                    placeholder="Reason for admission"
                    value={admitForm.reason}
                    onChange={(e) => setAdmitForm({ ...admitForm, reason: e.target.value })}
                  />
                  <button type="submit" disabled={admitSubmitting}>
                    {admitSubmitting ? 'Admitting...' : 'Admit Patient'}
                  </button>
                </div>

                <div className="admit-patient-cages">
                  <p className="cage-picker-label">Cage (optional) — click a cage to assign it, click again to clear</p>
                  <CagePicker
                    cages={cages}
                    occupiedCageIds={occupiedCageIds}
                    value={admitForm.cage_id}
                    onChange={(cage_id) => setAdmitForm({ ...admitForm, cage_id })}
                  />
                </div>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
