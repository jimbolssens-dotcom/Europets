// app/patients/[id]/page.jsx
// Patient detail: full record, linking back to the owning client, plus the
// patient's vaccination history and a form to record a new one — the
// vaccination logic itself lives in useVaccinations/VaccinationForm/
// VaccinationHistory (shared with the consult page), laid out here beside
// the patient info instead of the consult page's generic side-by-side.

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useVaccinations } from '@/app/_components/useVaccinations';
import VaccinationForm from '@/app/_components/VaccinationForm';
import VaccinationHistory from '@/app/_components/VaccinationHistory';
import { usePatientAlerts } from '@/app/_components/usePatientAlerts';
import PatientAlerts from '@/app/_components/PatientAlerts';
import DentalChart from '@/app/_components/DentalChart';
import PatientHistoryPanel from '@/app/_components/PatientHistoryPanel';
import SpeciesField from '@/app/_components/SpeciesField';
import PetAttributeField from '@/app/_components/PetAttributeField';
import { CAT_BREEDS, DOG_BREEDS, CAT_COLORS, DOG_COLORS } from '@/lib/petAttributes';

const SEX_LABELS = {
  male: 'Male',
  female: 'Female',
  male_castrated: 'Male (Castrated)',
  female_spayed: 'Female (Spayed)',
  unknown: 'Unknown',
};

export default function PatientDetailPage() {
  const { id } = useParams();
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState([]);
  const [savingDentalChart, setSavingDentalChart] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);

  const load = () =>
    fetch(`/api/patients/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setPatient(data);
        setLoading(false);
      });

  useEffect(() => {
    load();
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const vac = useVaccinations(id, patient?.species);
  const patientAlerts = usePatientAlerts(id);

  async function toggleDeceased() {
    const nextDeceased = !patient.deceased;
    if (nextDeceased && !confirm(`Mark ${patient.name} as deceased (RIP)?`)) return;
    const res = await fetch(`/api/patients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deceased: nextDeceased }),
    });
    if (res.ok) {
      setPatient((prev) => ({ ...prev, deceased: nextDeceased }));
    }
  }

  function startEdit() {
    setEditForm({
      name: patient.name || '',
      species: patient.species || '',
      breed: patient.breed || '',
      color: patient.color || '',
      sex: patient.sex || '',
      date_of_birth: patient.date_of_birth || '',
      current_weight_kg: patient.current_weight_kg ?? '',
      microchip_number: patient.microchip_number || '',
      microchip_implanted_at: patient.microchip_implanted_at || '',
      notes: patient.notes || '',
    });
    setEditError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditError(null);
  }

  async function saveEdit(e) {
    e.preventDefault();
    setSavingEdit(true);
    setEditError(null);
    const res = await fetch(`/api/patients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...editForm,
        current_weight_kg: editForm.current_weight_kg === '' ? null : Number(editForm.current_weight_kg),
        date_of_birth: editForm.date_of_birth || null,
        microchip_implanted_at: editForm.microchip_implanted_at || null,
      }),
    });
    const data = await res.json();
    setSavingEdit(false);
    if (!res.ok) {
      setEditError(data.error || 'Failed to save patient');
      return;
    }
    setEditing(false);
    load();
  }

  async function updateDentalChart(newChart) {
    setSavingDentalChart(true);
    const res = await fetch(`/api/patients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dental_chart: newChart }),
    });
    const data = await res.json();
    setSavingDentalChart(false);
    if (res.ok) {
      setPatient((prev) => ({ ...prev, dental_chart: data.dental_chart }));
    }
  }

  if (loading) return <p>Loading patient...</p>;
  if (!patient || patient.error) return <p>Patient not found.</p>;

  return (
    <div>
      <p>
        <a href="/search">&larr; Back to Search</a>
      </p>
      <div className="consult-header-row">
        <h1>
          {patient.name} <span>(Patient #{patient.patient_number})</span>
          {patient.deceased && <span className="error"> · Deceased</span>}{' '}
          <a href={`/appointments?client_id=${patient.client_id}&patient_id=${patient.id}`} className="button-link">
            Book Appointment
          </a>{' '}
          <a href={`/consults?client_id=${patient.client_id}&patient_id=${patient.id}`} className="button-link">
            New Consult
          </a>{' '}
          <a href={`/invoices?client_id=${patient.client_id}`} className="button-link">
            Invoice
          </a>{' '}
          <a href={`/patients/${patient.id}/history`} className="button-link">
            📖 Full Patient History
          </a>{' '}
          <button type="button" className="button-link" onClick={toggleDeceased}>
            {patient.deceased ? (
              'Undo RIP'
            ) : (
              <>
                Mark as RIP <span style={{ fontSize: '0.8em' }}>🐾</span>
              </>
            )}
          </button>
        </h1>
        <details className="patient-alerts-panel" open={patientAlerts.alerts.length > 0}>
          <summary>
            ⚠️ Long-Term Patient Notes {patientAlerts.alerts.length > 0 && `(${patientAlerts.alerts.length})`}
          </summary>
          <PatientAlerts {...patientAlerts} staff={staff} />
        </details>
      </div>

      <div className="split">
        <div className="split-main">
          {editing ? (
            <form className="card" onSubmit={saveEdit}>
              {editError && <p className="error">{editError}</p>}
              <label>
                Name
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </label>
              <SpeciesField value={editForm.species} onChange={(species) => setEditForm({ ...editForm, species })} />
              <PetAttributeField
                species={editForm.species}
                value={editForm.breed}
                onChange={(breed) => setEditForm({ ...editForm, breed })}
                catOptions={CAT_BREEDS}
                dogOptions={DOG_BREEDS}
                placeholder="Breed"
              />
              <PetAttributeField
                species={editForm.species}
                value={editForm.color}
                onChange={(color) => setEditForm({ ...editForm, color })}
                catOptions={CAT_COLORS}
                dogOptions={DOG_COLORS}
                placeholder="Color"
              />
              <label>
                Sex
                <select value={editForm.sex} onChange={(e) => setEditForm({ ...editForm, sex: e.target.value })}>
                  <option value="">Select...</option>
                  {Object.entries(SEX_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date of birth
                <input
                  type="date"
                  value={editForm.date_of_birth}
                  onChange={(e) => setEditForm({ ...editForm, date_of_birth: e.target.value })}
                />
              </label>
              <label>
                Weight (kg)
                <input
                  type="number"
                  step="0.01"
                  value={editForm.current_weight_kg}
                  onChange={(e) => setEditForm({ ...editForm, current_weight_kg: e.target.value })}
                />
              </label>
              <label>
                Microchip #
                <input
                  value={editForm.microchip_number}
                  onChange={(e) => setEditForm({ ...editForm, microchip_number: e.target.value })}
                />
              </label>
              <label>
                Microchip implanted
                <input
                  type="date"
                  value={editForm.microchip_implanted_at}
                  onChange={(e) => setEditForm({ ...editForm, microchip_implanted_at: e.target.value })}
                />
              </label>
              <label>
                Notes
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                />
              </label>
              <div className="home-links">
                <button type="submit" disabled={savingEdit}>
                  {savingEdit ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={cancelEdit} disabled={savingEdit}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
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
                <span className="patient-fact-label">Color</span>
                <span>{patient.color || '—'}</span>
              </div>
              <div className="patient-fact">
                <span className="patient-fact-label">Sex</span>
                <span>{SEX_LABELS[patient.sex] || 'unknown'}</span>
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
                <span className="patient-fact-label">Microchip implanted</span>
                <span>{patient.microchip_implanted_at || '—'}</span>
              </div>
              <div className="patient-fact">
                <span className="patient-fact-label">Notes</span>
                <span>{patient.notes || '—'}</span>
              </div>
            </div>
          )}
          {!editing && (
            <p>
              <button type="button" onClick={startEdit}>
                Edit
              </button>
            </p>
          )}
        </div>

        <div className="split-aside">
          <VaccinationForm {...vac} species={patient.species} staff={staff} />
        </div>
      </div>

      <PatientHistoryPanel
        patientId={patient.id}
        clientId={patient.client_id}
        title="Consults, Hospitalizations & Invoices"
      />

      <h2>Vaccination History</h2>
      <VaccinationHistory vaccinations={vac.vaccinations} onDelete={vac.deleteVaccination} />

      <h2>Dental Chart</h2>
      <DentalChart
        species={patient.species}
        value={patient.dental_chart}
        onChange={updateDentalChart}
        saving={savingDentalChart}
      />
    </div>
  );
}
