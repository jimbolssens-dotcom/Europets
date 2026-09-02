// app/hospitalization/cages/page.jsx
// Cage Layout: a visual map of the clinic's physical cages (see
// CageFloorPlan for the arrangement). Tap/click an occupied cage to open
// that case's file; an empty cage offers a dropdown to assign one of the
// currently-admitted-but-unassigned patients to it. Assigning a cage at
// admission time itself happens on the Admit Patient form (Hospitalization
// list page), via the same floor plan in miniature.
//
// Occupied cages are also draggable — press and drag (mouse) or touch and
// drag (iPad) a patient onto another cage to move them there, or onto an
// already-occupied cage to swap the two. Built on Pointer Events rather
// than the HTML5 drag-and-drop API, which iOS Safari doesn't support, so
// the same code path handles mouse and touch. A drag is distinguished
// from a tap/click by movement past a small threshold.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import CageFloorPlan from '@/app/_components/CageFloorPlan';

const DRAG_THRESHOLD = 6;

function CageTile({ cage, hosp, unassignedAdmitted, onAssign, onUnassign, onDragStart, dragSourceId, dropTargetId }) {
  const isDragSource = dragSourceId === cage.id;
  const isDropTarget = dropTargetId === cage.id;

  if (hosp) {
    return (
      <div
        className={[
          'cage-tile',
          'cage-occupied',
          isDragSource ? 'cage-drag-source' : '',
          isDropTarget ? 'cage-drop-target' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-cage-id={cage.id}
        onPointerDown={(e) => onDragStart(e, cage, hosp)}
        title="Drag to move to another cage, or tap to open"
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

export default function CageLayoutPage() {
  const router = useRouter();
  const [cages, setCages] = useState([]);
  const [admitted, setAdmitted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drag, setDrag] = useState(null); // { hospId, patientName, fromCageId, x, y, moved, overCageId }
  const dragRef = useRef(null); // mirrors `drag` for use inside event handlers without stale closures

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
    loadAdmitted();
  }

  async function unassignCage(hospitalizationId) {
    if (!confirm('Free up this cage? The case stays admitted, just unassigned from a cage.')) return;
    await patchHosp(hospitalizationId, { cage_id: null });
    loadAdmitted();
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
      loadAdmitted();
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
      loadAdmitted();
      return;
    }
    const moveDragged = await patchHosp(hospId, { cage_id: toCageId });
    if (!moveDragged.ok) setError(moveDragged.error || 'Failed to swap those patients');
    loadAdmitted();
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

  if (loading) return <p>Loading cage layout...</p>;

  const occupancy = Object.fromEntries(admitted.filter((a) => a.cage_id).map((a) => [a.cage_id, a]));
  const unassignedAdmitted = admitted.filter((a) => !a.cage_id);
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
      <p>
        <a href="/hospitalization">&larr; Hospitalization</a>
      </p>
      <h1>Cage Layout</h1>
      <p className="visit-meta">
        Tap or click an occupied cage to open that case&apos;s file, or drag it onto another cage to
        move that patient there (drag onto an occupied cage to swap the two). An empty cage can
        also be assigned one of the currently admitted, unassigned patients from its dropdown. To
        assign a cage while admitting a new patient, use the picker on the Admit Patient form
        instead.
      </p>

      {error && <p className="error">{error}</p>}

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
  );
}
