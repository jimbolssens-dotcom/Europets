// app/patients/page.jsx
// Patient list + create form, with inline edit, delete, and a deceased flag.
// Demonstrates the realtime pattern used throughout the app: when one
// terminal adds/edits a patient, every other open terminal updates live.

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

const emptyEditForm = {
  name: '',
  species: '',
  breed: '',
  current_weight_kg: '',
  microchip_number: '',
  deceased: false,
};

export default function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [rowError, setRowError] = useState(null);

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

  function startEdit(patient) {
    setEditingId(patient.id);
    setEditForm({
      name: patient.name,
      species: patient.species,
      breed: patient.breed || '',
      current_weight_kg: patient.current_weight_kg ?? '',
      microchip_number: patient.microchip_number || '',
      deceased: patient.deceased || false,
    });
    setRowError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setRowError(null);
  }

  async function saveEdit(id) {
    setRowError(null);
    const payload = {
      ...editForm,
      current_weight_kg: editForm.current_weight_kg ? Number(editForm.current_weight_kg) : null,
      microchip_number: editForm.microchip_number || null,
    };

    const res = await fetch(`/api/patients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      setRowError(data.error || 'Failed to save patient');
    } else {
      setEditingId(null);
      loadPatients();
    }
  }

  async function deletePatient(patient) {
    if (!confirm(`Delete ${patient.name}? This cannot be undone.`)) return;
    setRowError(null);

    const res = await fetch(`/api/patients/${patient.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Failed to delete patient');
    } else {
      loadPatients();
    }
  }

  if (loading) return <p>Loading patients...</p>;

  return (
    <div>
      <h1>Patients</h1>
      {rowError && <p className="error">{rowError}</p>}
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
            <th>Deceased</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {patients.map((p) =>
            editingId === p.id ? (
              <tr key={p.id}>
                <td>{p.patient_number}</td>
                <td>
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    value={editForm.species}
                    onChange={(e) => setEditForm({ ...editForm, species: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    value={editForm.breed}
                    onChange={(e) => setEditForm({ ...editForm, breed: e.target.value })}
                  />
                </td>
                <td>
                  <a href={`/clients/${p.client_id}`}>{p.clients?.full_name}</a>
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.current_weight_kg}
                    onChange={(e) =>
                      setEditForm({ ...editForm, current_weight_kg: e.target.value })
                    }
                  />
                </td>
                <td>
                  <input
                    value={editForm.microchip_number}
                    onChange={(e) =>
                      setEditForm({ ...editForm, microchip_number: e.target.value })
                    }
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={editForm.deceased}
                    onChange={(e) => setEditForm({ ...editForm, deceased: e.target.checked })}
                  />
                </td>
                <td>
                  <button type="button" onClick={() => saveEdit(p.id)}>
                    Save
                  </button>
                  <button type="button" onClick={cancelEdit}>
                    Cancel
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={p.id}>
                <td>{p.patient_number}</td>
                <td>
                  <a href={`/patients/${p.id}`} style={p.deceased ? { textDecoration: 'line-through' } : undefined}>
                    {p.name}
                  </a>
                </td>
                <td>{p.species}</td>
                <td>{p.breed}</td>
                <td>
                  <a href={`/clients/${p.client_id}`}>{p.clients?.full_name}</a>
                </td>
                <td>{p.current_weight_kg}</td>
                <td>{p.microchip_number || '—'}</td>
                <td>{p.deceased ? 'Yes' : '—'}</td>
                <td>
                  <button type="button" onClick={() => startEdit(p)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => deletePatient(p)}>
                    Delete
                  </button>
                </td>
              </tr>
            )
          )}
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
