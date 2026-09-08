// app/consults/page.jsx
// Consults board: active consults (in progress) and a quick list of
// recently completed ones, each linking through to the full consult
// record. Consults start automatically when an appointment is checked in
// from the Appointments page, or as a walk-in below.

'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import SearchSelect from '@/app/_components/SearchSelect';
import ClientOrPatientSearch from '@/app/_components/ClientOrPatientSearch';

function elapsedMinutes(startedAt) {
  return Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
}

const emptyWalkIn = { client_id: '', patient_id: '', room_id: '', attending_vet_id: '' };

export default function ConsultsPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <ConsultsPageInner />
    </Suspense>
  );
}

// A ?client_id=&patient_id= deep link (see the patient page's "New
// Consult" button) is read via useSearchParams below, which requires a
// Suspense boundary around it — split out into its own component so the
// wrapper above stays a plain server-renderable shell.
function ConsultsPageInner() {
  const searchParams = useSearchParams();
  const [consults, setConsults] = useState([]);
  const [selectedOwner, setSelectedOwner] = useState(null); // { id, full_name } for the client currently picked below
  const [clientPatients, setClientPatients] = useState([]); // that owner's own pets, for the patient picker
  const [rooms, setRooms] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [walkIn, setWalkIn] = useState(emptyWalkIn);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [rowError, setRowError] = useState(null);
  const walkInFormRef = useRef(null);

  const loadConsults = () =>
    fetch('/api/visits')
      .then((res) => res.json())
      .then((data) => {
        setConsults(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    loadConsults();
    Promise.all([
      fetch('/api/rooms').then((res) => res.json()),
      fetch('/api/staff').then((res) => res.json()),
    ]).then(([roomsData, staffData]) => {
      setRooms(Array.isArray(roomsData) ? roomsData : []);
      setStaff(Array.isArray(staffData) ? staffData : []);
    });

    const channel = supabase
      .channel('consults-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () =>
        loadConsults()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Loads the owner's own pets once one is picked (either from the search
  // box directly, or resolved from a client_id/patient_id deep link below)
  // — fetched on demand per-owner rather than the whole patients table, now
  // that the clinic's historical import makes that table tens of thousands
  // of rows.
  useEffect(() => {
    if (!walkIn.client_id) {
      setClientPatients([]);
      return;
    }
    fetch(`/api/patients?client_id=${walkIn.client_id}`)
      .then((res) => res.json())
      .then((data) => setClientPatients(Array.isArray(data) ? data : []));
  }, [walkIn.client_id]);

  // A "New Consult" link elsewhere (the patient detail page) can land here
  // with ?client_id=&patient_id= already known — resolve the owner's name
  // for display and pre-fill the walk-in form, scrolled into view, instead
  // of making staff search for who they just came from.
  useEffect(() => {
    const clientId = searchParams.get('client_id');
    const patientId = searchParams.get('patient_id');
    if (!clientId) return;
    fetch(`/api/clients/${clientId}`)
      .then((res) => res.json())
      .then((client) => {
        if (!client || client.error) return;
        setSelectedOwner({ id: client.id, full_name: client.full_name });
        setWalkIn((w) => ({ ...w, client_id: clientId, patient_id: patientId || '' }));
        walkInFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleWalkIn(e) {
    e.preventDefault();
    if (!walkIn.client_id || !walkIn.patient_id || !walkIn.room_id) {
      setError('Select an owner, patient, and room');
      return;
    }
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_id: walkIn.patient_id,
        room_id: walkIn.room_id,
        attending_vet_id: walkIn.attending_vet_id || null,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Failed to start consult');
    } else {
      setWalkIn(emptyWalkIn);
      setSelectedOwner(null);
      loadConsults();
    }
    setSubmitting(false);
  }

  async function deleteConsult(consult) {
    if (!confirm(`Delete this consult for ${consult.patients?.name}? This cannot be undone.`))
      return;
    setRowError(null);

    const res = await fetch(`/api/visits/${consult.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      setRowError(data.error || 'Failed to delete consult');
    } else {
      loadConsults();
    }
  }

  if (loading) return <p>Loading consults...</p>;

  // A consult stays 'in_progress' the whole time its patient is admitted to
  // hospitalization (admitting doesn't touch the visit's status — see
  // app/(admin)/consults/[id]/page.jsx's admitToHospital) — split those out
  // of "Active" so the board isn't dominated by long-running hospital stays.
  // The consult reappears here (still uncompleted) once discharged, ready
  // to be closed out.
  const inProgress = consults.filter((c) => c.status === 'in_progress');
  const hospitalized = inProgress.filter((c) => (c.hospitalizations || []).some((h) => h.status === 'admitted'));
  const active = inProgress.filter((c) => !hospitalized.includes(c));
  const completed = consults
    .filter((c) => c.status === 'complete')
    .sort((a, b) => new Date(b.ended_at || b.started_at) - new Date(a.ended_at || a.started_at))
    .slice(0, 20);

  const vets = staff.filter((s) => s.role === 'vet');

  return (
    <div>
      <h1>Consults</h1>
      {rowError && <p className="error">{rowError}</p>}

      <div className="split">
      <div className="split-main">
      <h2>Active</h2>
      {active.length === 0 ? (
        <p>No active consults right now.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Owner</th>
              <th>Room</th>
              <th>Vet</th>
              <th>In progress</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {active.map((c) => (
              <tr key={c.id}>
                <td>{c.patients?.name}</td>
                <td>{c.clients?.full_name}</td>
                <td>{c.rooms?.name}</td>
                <td>{c.staff?.full_name || 'unassigned'}</td>
                <td>{elapsedMinutes(c.started_at)} min</td>
                <td>
                  <a href={`/consults/${c.id}`}>Open</a>
                  <button type="button" onClick={() => deleteConsult(c)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Hospitalized</h2>
      {hospitalized.length === 0 ? (
        <p>No hospitalized patients right now.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Owner</th>
              <th>Vet</th>
              <th>Admitted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {hospitalized.map((c) => {
              const hosp = c.hospitalizations?.find((h) => h.status === 'admitted');
              return (
                <tr key={c.id}>
                  <td>{c.patients?.name}</td>
                  <td>{c.clients?.full_name}</td>
                  <td>{c.staff?.full_name || 'unassigned'}</td>
                  <td>{hosp?.admitted_at ? new Date(hosp.admitted_at).toLocaleString() : '—'}</td>
                  <td>
                    {hosp && <a href={`/hospitalization/${hosp.id}`}>Hospitalization</a>}
                    <a href={`/consults/${c.id}`}>Consult note</a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h2>Recently completed</h2>
      {completed.length === 0 ? (
        <p>No completed consults yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Owner</th>
              <th>Ended</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {completed.map((c) => (
              <tr key={c.id}>
                <td>{c.patients?.name}</td>
                <td>{c.clients?.full_name}</td>
                <td>{c.ended_at ? new Date(c.ended_at).toLocaleString() : '—'}</td>
                <td>
                  <a href={`/consults/${c.id}`}>Open</a>
                  <button type="button" onClick={() => deleteConsult(c)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      </div>

      <div className="split-aside">
      <form className="card" onSubmit={handleWalkIn} ref={walkInFormRef}>
        <h2>Start Walk-in Consult</h2>
        {error && <p className="error">{error}</p>}
        {selectedOwner ? (
          <p className="booking-owner-picked">
            Owner: <strong>{selectedOwner.full_name}</strong>{' '}
            <button
              type="button"
              onClick={() => {
                setSelectedOwner(null);
                setWalkIn({ ...walkIn, client_id: '', patient_id: '' });
              }}
            >
              Change
            </button>
          </p>
        ) : (
          <ClientOrPatientSearch
            placeholder="Search clients or patients..."
            onPickClient={(c) => {
              setSelectedOwner({ id: c.id, full_name: c.full_name });
              setWalkIn({ ...walkIn, client_id: c.id, patient_id: '' });
            }}
            onPickPatient={(p) => {
              setSelectedOwner({ id: p.client_id, full_name: p.clients?.full_name || '' });
              setWalkIn({ ...walkIn, client_id: p.client_id, patient_id: p.id });
            }}
          />
        )}
        <SearchSelect
          items={clientPatients}
          value={walkIn.patient_id}
          onChange={(patient_id) => setWalkIn({ ...walkIn, patient_id })}
          getLabel={(p) => p.name}
          getSubLabel={(p) => p.species}
          placeholder="Select patient..."
          disabled={!walkIn.client_id}
        />
        <select
          required
          value={walkIn.room_id}
          onChange={(e) => setWalkIn({ ...walkIn, room_id: e.target.value })}
        >
          <option value="">Select room...</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          value={walkIn.attending_vet_id}
          onChange={(e) => setWalkIn({ ...walkIn, attending_vet_id: e.target.value })}
        >
          <option value="">Select vet (optional)...</option>
          {vets.map((v) => (
            <option key={v.id} value={v.id}>
              {v.full_name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Starting...' : 'Start'}
        </button>
      </form>
      </div>
      </div>
    </div>
  );
}
