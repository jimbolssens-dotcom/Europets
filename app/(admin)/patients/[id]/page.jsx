// app/patients/[id]/page.jsx
// Patient detail: full record, linking back to the owning client, plus the
// patient's vaccination history and a form to record a new one — filtered
// to protocols for this patient's species (cat vs dog).

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { classifySpecies } from '@/lib/species';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dateStr}T00:00:00`);
  return Math.round((due - today) / 86400000);
}

function dueStatus(dateStr) {
  if (!dateStr) return null;
  const d = daysUntil(dateStr);
  if (d < 0) return { label: `Overdue by ${Math.abs(d)}d`, className: 'error' };
  if (d <= 30) return { label: `Due in ${d}d`, className: '' };
  return { label: `Due ${formatDate(dateStr)}`, className: 'visit-meta' };
}

// date_given + a protocol's interval_months, as YYYY-MM-DD, for the
// next-due-date preview shown while filling in the Add Vaccination form.
function addMonths(dateStr, months) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

const STANDARD_INTERVAL_MONTHS = 12; // the default before a specific protocol is picked

function makeEmptyForm() {
  return {
    vaccine_protocol_id: '',
    date_given: todayISODate(),
    next_due_date: addMonths(todayISODate(), STANDARD_INTERVAL_MONTHS),
    batch_number: '',
    administered_by: '',
    notes: '',
  };
}

export default function PatientDetailPage() {
  const { id } = useParams();
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [vaccinations, setVaccinations] = useState([]);
  const [protocols, setProtocols] = useState([]);
  const [protocolsError, setProtocolsError] = useState(null);
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState(makeEmptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const load = () =>
    fetch(`/api/patients/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setPatient(data);
        setLoading(false);
      });

  const loadVaccinations = () =>
    fetch(`/api/vaccinations?patient_id=${id}`)
      .then((res) => res.json())
      .then((data) => setVaccinations(Array.isArray(data) ? data : []));

  useEffect(() => {
    load();
    loadVaccinations();
    fetch('/api/vaccine-protocols?active=true')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setProtocols(data);
        } else {
          setProtocols([]);
          setProtocolsError(data?.error || 'Failed to load vaccine protocols');
        }
      });
    fetch('/api/staff')
      .then((res) => res.json())
      .then((data) => setStaff(Array.isArray(data) ? data : []));

    const channel = supabase
      .channel(`patient-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'patients', filter: `id=eq.${id}` },
        () => load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vaccinations', filter: `patient_id=eq.${id}` },
        () => loadVaccinations()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const speciesClass = classifySpecies(patient?.species);
  const relevantProtocols = useMemo(() => {
    if (!speciesClass) return protocols; // can't tell cat vs dog — offer everything rather than block entry
    return protocols.filter((p) => p.species === speciesClass);
  }, [protocols, speciesClass]);

  const selectedProtocol = protocols.find((p) => p.id === form.vaccine_protocol_id);

  function selectProtocol(protocolId) {
    const protocol = protocols.find((p) => p.id === protocolId);
    const months = protocol ? protocol.interval_months : STANDARD_INTERVAL_MONTHS;
    setForm({
      ...form,
      vaccine_protocol_id: protocolId,
      next_due_date: addMonths(form.date_given, months),
    });
  }

  function setDateGiven(dateGiven) {
    const months = selectedProtocol ? selectedProtocol.interval_months : STANDARD_INTERVAL_MONTHS;
    setForm({
      ...form,
      date_given: dateGiven,
      next_due_date: addMonths(dateGiven, months),
    });
  }

  async function addVaccination(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/vaccinations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, patient_id: id, administered_by: form.administered_by || null }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Failed to record vaccination');
    } else {
      setForm(makeEmptyForm());
      loadVaccinations();
    }
    setSubmitting(false);
  }

  async function deleteVaccination(v) {
    if (!confirm(`Delete this ${v.vaccine_name} record from ${formatDate(v.date_given)}?`)) return;
    await fetch(`/api/vaccinations/${v.id}`, { method: 'DELETE' });
    loadVaccinations();
  }

  if (loading) return <p>Loading patient...</p>;
  if (!patient || patient.error) return <p>Patient not found.</p>;

  return (
    <div>
      <p>
        <a href="/patients">&larr; All patients</a>
      </p>
      <h1>
        {patient.name} <span>(Patient #{patient.patient_number})</span>
        {patient.deceased && <span className="error"> · Deceased</span>}
      </h1>

      <table>
        <tbody>
          <tr>
            <th>Owner</th>
            <td>
              <a href={`/clients/${patient.clients?.id}`}>
                {patient.clients?.full_name} (Client #{patient.clients?.client_number})
              </a>
            </td>
          </tr>
          <tr>
            <th>Species</th>
            <td>{patient.species}</td>
          </tr>
          <tr>
            <th>Breed</th>
            <td>{patient.breed || '—'}</td>
          </tr>
          <tr>
            <th>Sex</th>
            <td>{patient.sex || 'unknown'}</td>
          </tr>
          <tr>
            <th>Date of birth</th>
            <td>{patient.date_of_birth || '—'}</td>
          </tr>
          <tr>
            <th>Weight (kg)</th>
            <td>{patient.current_weight_kg ?? '—'}</td>
          </tr>
          <tr>
            <th>Microchip #</th>
            <td>{patient.microchip_number || '—'}</td>
          </tr>
          <tr>
            <th>Notes</th>
            <td>{patient.notes || '—'}</td>
          </tr>
        </tbody>
      </table>

      <h2>Vaccinations</h2>
      <div className="split">
        <div className="split-main">
          {vaccinations.length === 0 ? (
            <p>No vaccinations recorded yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Vaccine</th>
                  <th>Given</th>
                  <th>Next due</th>
                  <th>By</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vaccinations.map((v) => {
                  const status = dueStatus(v.next_due_date);
                  return (
                    <tr key={v.id}>
                      <td>
                        {v.vaccine_name}
                        {v.batch_number && <div className="visit-meta">Batch {v.batch_number}</div>}
                        {v.notes && <div className="visit-meta">{v.notes}</div>}
                      </td>
                      <td>{formatDate(v.date_given)}</td>
                      <td className={status?.className}>{status?.label || '—'}</td>
                      <td>{v.staff?.full_name || '—'}</td>
                      <td>
                        <button type="button" onClick={() => deleteVaccination(v)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="split-aside">
          <form className="card" onSubmit={addVaccination}>
            <h3>Add Vaccination</h3>
            {error && <p className="error">{error}</p>}
            {protocolsError && (
              <p className="error">
                {protocolsError} — check the{' '}
                <a href="/vaccine-protocols">Vaccine Protocols catalog</a> in Settings.
              </p>
            )}
            {!protocolsError && relevantProtocols.length === 0 && (
              <p className="error">
                No active vaccine protocols found. Add some on the{' '}
                <a href="/vaccine-protocols">Vaccine Protocols</a> page under Settings.
              </p>
            )}
            {!speciesClass && relevantProtocols.length > 0 && (
              <p className="visit-meta">
                Couldn&apos;t tell cat vs dog from &quot;{patient.species}&quot; — showing every protocol.
              </p>
            )}
            <select
              required
              disabled={relevantProtocols.length === 0}
              value={form.vaccine_protocol_id}
              onChange={(e) => selectProtocol(e.target.value)}
            >
              <option value="">Select vaccine...</option>
              {relevantProtocols.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.core ? '' : '(optional)'}
                </option>
              ))}
            </select>

            <label>
              Date given
              <input
                type="date"
                required
                value={form.date_given}
                onChange={(e) => setDateGiven(e.target.value)}
              />
            </label>

            <label>
              Next due
              <input
                type="date"
                value={form.next_due_date}
                onChange={(e) => setForm({ ...form, next_due_date: e.target.value })}
              />
            </label>

            <input
              placeholder="Batch number (optional)"
              value={form.batch_number}
              onChange={(e) => setForm({ ...form, batch_number: e.target.value })}
            />

            <select
              value={form.administered_by}
              onChange={(e) => setForm({ ...form, administered_by: e.target.value })}
            >
              <option value="">Administered by (optional)...</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>

            <textarea
              rows={2}
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />

            <button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : 'Add Vaccination'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
