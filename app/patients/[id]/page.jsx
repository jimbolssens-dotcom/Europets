// app/patients/[id]/page.jsx
// Patient detail: full record, linking back to the owning client.

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function PatientDetailPage() {
  const { id } = useParams();
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () =>
    fetch(`/api/patients/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setPatient(data);
        setLoading(false);
      });

  useEffect(() => {
    load();

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
    </div>
  );
}
