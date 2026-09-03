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

const SEX_LABELS = {
  male: 'Male',
  female: 'Female',
  male_castrated: 'Male (Castrated)',
  female_spayed: 'Female (Spayed)',
};

export default function PatientDetailPage() {
  const { id } = useParams();
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState([]);
  const [savingDentalChart, setSavingDentalChart] = useState(false);

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
        <a href="/patients">&larr; All patients</a>
      </p>
      <h1>
        {patient.name} <span>(Patient #{patient.patient_number})</span>
        {patient.deceased && <span className="error"> · Deceased</span>}
      </h1>

      <div className="patient-alerts-panel patient-alerts-panel-static">
        <h2>⚠️ Long-Term Patient Notes</h2>
        <PatientAlerts {...patientAlerts} staff={staff} />
      </div>

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
              <span className="patient-fact-label">Notes</span>
              <span>{patient.notes || '—'}</span>
            </div>
          </div>
        </div>

        <div className="split-aside">
          <VaccinationForm {...vac} species={patient.species} staff={staff} />
        </div>
      </div>

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
