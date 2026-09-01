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

function addMonths(dateStr, months) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function makeEmptyForm() {
  return {
    vaccine_protocol_ids: [],
    date_given: todayISODate(),
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

  function toggleProtocol(protocolId) {
    setForm((prev) => ({
      ...prev,
      vaccine_protocol_ids: prev.vaccine_protocol_ids.includes(protocolId)
        ? prev.vaccine_protocol_ids.filter((id) => id !== protocolId)
        : [...prev.vaccine_protocol_ids, protocolId],
    }));
  }

  // One vaccine given in the same visit can mean several checked at once
  // (e.g. PCH + Rabies for a cat) — record one row per checked protocol,
  // sharing the date/batch/vet/notes.
  //
  // Annual: next_due_date is left for the server to compute from each
  // protocol's own interval (normally 12 months).
  //
  // Primary booster: the species' core (non-rabies) protocol gets its
  // next_due_date set to one month out instead. If rabies wasn't among the
  // checked boxes, a rabies reminder for that same one-month date is added
  // too — a "scheduled, not yet given" row (no date_given) rather than
  // pretending rabies was administered today. If rabies WAS checked, its
  // row is left on the normal annual cycle — no extra reminder needed.
  async function addVaccination(e, isPrimary) {
    e.preventDefault();
    if (form.vaccine_protocol_ids.length === 0) {
      setError('Check at least one vaccine given');
      return;
    }
    setSubmitting(true);
    setError(null);

    const checkedProtocols = relevantProtocols.filter((p) => form.vaccine_protocol_ids.includes(p.id));
    const coreProtocol = relevantProtocols.find((p) => p.core && !p.is_rabies);
    const rabiesGiven = checkedProtocols.some((p) => p.is_rabies);
    const boosterDue = isPrimary ? addMonths(form.date_given, 1) : null;

    const payloads = checkedProtocols.map((p) => ({
      patient_id: id,
      vaccine_protocol_id: p.id,
      date_given: form.date_given,
      batch_number: form.batch_number,
      administered_by: form.administered_by || null,
      notes: form.notes,
      is_primary: isPrimary,
      ...(isPrimary && coreProtocol && p.id === coreProtocol.id ? { next_due_date: boosterDue } : {}),
    }));

    if (isPrimary && !rabiesGiven) {
      const rabiesProtocol = relevantProtocols.find((p) => p.is_rabies);
      if (rabiesProtocol) {
        payloads.push({
          patient_id: id,
          vaccine_protocol_id: rabiesProtocol.id,
          date_given: null,
          next_due_date: boosterDue,
          is_primary: true,
          notes: 'Primary course booster — rabies not given at the first visit',
        });
      }
    }

    const results = await Promise.all(
      payloads.map((payload) =>
        fetch('/api/vaccinations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(async (res) => ({ ok: res.ok, data: await res.json() }))
      )
    );

    const failed = results.find((r) => !r.ok);
    if (failed) {
      setError(failed.data.error || 'Failed to record one or more vaccinations');
    } else {
      setForm(makeEmptyForm());
    }
    loadVaccinations();
    setSubmitting(false);
  }

  async function deleteVaccination(v) {
    const when = v.date_given ? formatDate(v.date_given) : 'not yet given';
    if (!confirm(`Delete this ${v.vaccine_name} record (${when})?`)) return;
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

      <div className="split">
        <div className="split-main">
          <div className="patient-facts">
            <div className="patient-fact">
              <span className="patient-fact-label">Owner</span>
              <a href={`/clients/${patient.clients?.id}`}>
                {patient.clients?.full_name} (Client #{patient.clients?.client_number})
              </a>
            </div>
            <div className="patient-fact">
              <span className="patient-fact-label">Species</span>
              <span>{patient.species}</span>
            </div>
            <div className="patient-fact">
              <span className="patient-fact-label">Breed</span>
              <span>{patient.breed || '—'}</span>
            </div>
            <div className="patient-fact">
              <span className="patient-fact-label">Sex</span>
              <span>{patient.sex || 'unknown'}</span>
            </div>
            <div className="patient-fact">
              <span className="patient-fact-label">Date of birth</span>
              <span>{patient.date_of_birth || '—'}</span>
            </div>
            <div className="patient-fact">
              <span className="patient-fact-label">Weight (kg)</span>
              <span>{patient.current_weight_kg ?? '—'}</span>
            </div>
            <div className="patient-fact">
              <span className="patient-fact-label">Microchip #</span>
              <span>{patient.microchip_number || '—'}</span>
            </div>
            <div className="patient-fact">
              <span className="patient-fact-label">Notes</span>
              <span>{patient.notes || '—'}</span>
            </div>
          </div>
        </div>

        <div className="split-aside">
          <form className="card" onSubmit={(e) => e.preventDefault()}>
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
            {relevantProtocols.length > 0 && (
              <fieldset className="vaccine-checklist">
                <legend>Vaccines given</legend>
                {relevantProtocols.map((p) => (
                  <label key={p.id} className="vaccine-checklist-item">
                    <input
                      type="checkbox"
                      checked={form.vaccine_protocol_ids.includes(p.id)}
                      onChange={() => toggleProtocol(p.id)}
                    />
                    {p.name} {p.core ? '' : '(optional)'}
                  </label>
                ))}
              </fieldset>
            )}

            <label>
              Date given
              <input
                type="date"
                required
                value={form.date_given}
                onChange={(e) => setForm({ ...form, date_given: e.target.value })}
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

            <p className="visit-meta" style={{ margin: 0 }}>
              Primary Booster schedules the core vaccine for a 1-month booster and, if rabies
              isn&apos;t checked above, adds a rabies reminder for that same date.
            </p>
            <div className="vaccine-submit-actions">
              <button
                type="button"
                onClick={(e) => addVaccination(e, false)}
                disabled={submitting || form.vaccine_protocol_ids.length === 0}
              >
                {submitting ? 'Saving...' : 'Add as Annual Vaccine'}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={(e) => addVaccination(e, true)}
                disabled={submitting || form.vaccine_protocol_ids.length === 0}
              >
                {submitting ? 'Saving...' : 'Add as Primary Booster'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <h2>Vaccination History</h2>
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
                    {v.is_primary && <span className="primary-badge">Primary</span>}
                    {v.batch_number && <div className="visit-meta">Batch {v.batch_number}</div>}
                    {v.notes && <div className="visit-meta">{v.notes}</div>}
                  </td>
                  <td>{v.date_given ? formatDate(v.date_given) : <em>Scheduled</em>}</td>
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
  );
}
