// app/patients/page.jsx
// Patient list + create form. Demonstrates the realtime pattern used
// throughout the app: when one terminal adds/edits a patient, every
// other open terminal updates live.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const emptyForm = {
  client_id: '',
  name: '',
  species: '',
  breed: '',
  date_of_birth: '',
  sex: '',
  current_weight_kg: '',
  microchip_number: '',
};

export default function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const loadPatients = () =>
    fetch('/api/patients')
      .then((res) => res.json())
      .then((data) => {
        setPatients(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    loadPatients();
    fetch('/api/clients')
      .then((res) => res.json())
      .then((data) => setClients(Array.isArray(data) ? data : []));

    // live subscription: any insert/update/delete on 'patients'
    // pushes to every terminal with this page open, in real time.
    const channel = supabase
      .channel('patients-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'patients' },
        () => loadPatients()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = {
      ...form,
      current_weight_kg: form.current_weight_kg ? Number(form.current_weight_kg) : null,
      date_of_birth: form.date_of_birth || null,
      microchip_number: form.microchip_number || null,
    };

    const res = await fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Failed to create patient');
    } else {
      setForm(emptyForm);
      loadPatients();
    }
    setSubmitting(false);
  }

  if (loading) return <p>Loading patients...</p>;

  return (
    <div>
      <h1>Patients</h1>
      <table>
        <thead>
          <tr>
            <th>Patient #</th>
            <th>Name</th>
            <th>Species</th>
            <th>Breed</th>
            <th>Owner</th>
            <th>Weight (kg)</th>
            <th>Microchip #</th>
          </tr>
        </thead>
        <tbody>
          {patients.map((p) => (
            <tr key={p.id}>
              <td>{p.patient_number}</td>
              <td>
                <a href={`/patients/${p.id}`}>{p.name}</a>
              </td>
              <td>{p.species}</td>
              <td>{p.breed}</td>
              <td>
                <a href={`/clients/${p.client_id}`}>{p.clients?.full_name}</a>
              </td>
              <td>{p.current_weight_kg}</td>
              <td>{p.microchip_number || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <form className="card" onSubmit={handleSubmit}>
        <h2>Add Patient</h2>
        {error && <p className="error">{error}</p>}
        <select
          required
          value={form.client_id}
          onChange={(e) => setForm({ ...form, client_id: e.target.value })}
        >
          <option value="">Select owner...</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
        <input
          placeholder="Patient name"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          placeholder="Species (dog, cat, ...)"
          required
          value={form.species}
          onChange={(e) => setForm({ ...form, species: e.target.value })}
        />
        <input
          placeholder="Breed"
          value={form.breed}
          onChange={(e) => setForm({ ...form, breed: e.target.value })}
        />
        <input
          type="date"
          value={form.date_of_birth}
          onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
        />
        <select
          value={form.sex}
          onChange={(e) => setForm({ ...form, sex: e.target.value })}
        >
          <option value="">Sex (unknown)</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
        <input
          placeholder="Weight (kg)"
          type="number"
          step="0.01"
          value={form.current_weight_kg}
          onChange={(e) => setForm({ ...form, current_weight_kg: e.target.value })}
        />
        <input
          placeholder="Microchip number (optional)"
          value={form.microchip_number}
          onChange={(e) => setForm({ ...form, microchip_number: e.target.value })}
        />
        <button type="submit" disabled={submitting || clients.length === 0}>
          {submitting ? 'Saving...' : 'Add Patient'}
        </button>
        {clients.length === 0 && <p>Add a client first.</p>}
      </form>
    </div>
  );
}
