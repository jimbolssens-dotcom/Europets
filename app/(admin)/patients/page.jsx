// app/patients/page.jsx
// Patient search + create, with inline edit, delete, and a deceased flag.
// The patient list can grow large, so nothing loads until a search is run.
// Search and Add Patient sit side by side; results appear below once you
// search.

'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import SpeciesField from '@/app/_components/SpeciesField';
import PetAttributeField from '@/app/_components/PetAttributeField';
import SearchSelect from '@/app/_components/SearchSelect';
import { CAT_BREEDS, DOG_BREEDS, CAT_COLORS, DOG_COLORS } from '@/lib/petAttributes';

const emptyForm = {
  client_id: '',
  name: '',
  species: '',
  breed: '',
  color: '',
  date_of_birth: '',
  sex: '',
  current_weight_kg: '',
  microchip_number: '',
  microchip_implanted_at: '',
  last_vaccination_date: '',
};

const emptyEditForm = {
  name: '',
  species: '',
  breed: '',
  color: '',
  current_weight_kg: '',
  microchip_number: '',
  microchip_implanted_at: '',
  deceased: false,
};

const emptySearch = { patient_number: '', name: '', species: '', breed: '', microchip: '', owner: '' };

function buildQuery(search) {
  const params = new URLSearchParams();
  if (search.patient_number.trim()) params.set('patient_number', search.patient_number.trim());
  if (search.name.trim()) params.set('name', search.name.trim());
  if (search.species.trim()) params.set('species', search.species.trim());
  if (search.breed.trim()) params.set('breed', search.breed.trim());
  if (search.microchip.trim()) params.set('microchip', search.microchip.trim());
  if (search.owner.trim()) params.set('owner', search.owner.trim());
  return params.toString();
}

function hasAnyTerm(search) {
  return Object.values(search).some((v) => v.trim());
}

function PatientsPageInner() {
  const searchParams = useSearchParams();
  const prefilledClientId = searchParams.get('client_id') || '';

  const [results, setResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState(emptySearch);

  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ ...emptyForm, client_id: prefilledClientId });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [rowError, setRowError] = useState(null);

  const searchRef = useRef(search);
  const hasSearchedRef = useRef(hasSearched);
  searchRef.current = search;
  hasSearchedRef.current = hasSearched;

  const runSearch = (searchValues) => {
    setSearching(true);
    fetch(`/api/patients?${buildQuery(searchValues)}`)
      .then((res) => res.json())
      .then((data) => {
        setResults(Array.isArray(data) ? data : []);
        setHasSearched(true);
        setSearching(false);
      });
  };

  useEffect(() => {
    // Only the Add Patient form's owner dropdown needs the full client list.
    fetch('/api/clients')
      .then((res) => res.json())
      .then((data) => setClients(Array.isArray(data) ? data : []));

    const channel = supabase
      .channel('patients-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, () => {
        if (hasSearchedRef.current) runSearch(searchRef.current);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function handleSearchSubmit(e) {
    e.preventDefault();
    if (!hasAnyTerm(search)) return;
    runSearch(search);
  }

  function clearSearch() {
    setSearch(emptySearch);
    setResults([]);
    setHasSearched(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.client_id) {
      setError('Select an owner');
      return;
    }
    setSubmitting(true);
    setError(null);

    const payload = {
      ...form,
      current_weight_kg: form.current_weight_kg ? Number(form.current_weight_kg) : null,
      date_of_birth: form.date_of_birth || null,
      microchip_number: form.microchip_number || null,
      microchip_implanted_at: form.microchip_implanted_at || null,
      last_vaccination_date: form.last_vaccination_date || null,
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
      if (hasSearched) runSearch(search);
    }
    setSubmitting(false);
  }

  function startEdit(patient) {
    setEditingId(patient.id);
    setEditForm({
      name: patient.name,
      species: patient.species,
      breed: patient.breed || '',
      color: patient.color || '',
      current_weight_kg: patient.current_weight_kg ?? '',
      microchip_number: patient.microchip_number || '',
      microchip_implanted_at: patient.microchip_implanted_at || '',
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
      microchip_implanted_at: editForm.microchip_implanted_at || null,
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
      runSearch(search);
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
      runSearch(search);
    }
  }

  return (
    <div>
      <h1>Patients</h1>
      {rowError && <p className="error">{rowError}</p>}

      <div className="two-col">
        <form className="card" onSubmit={handleSearchSubmit}>
          <h2>Search Patients</h2>
          <input
            placeholder="Patient #"
            value={search.patient_number}
            onChange={(e) => setSearch({ ...search, patient_number: e.target.value })}
          />
          <input
            placeholder="Name"
            value={search.name}
            onChange={(e) => setSearch({ ...search, name: e.target.value })}
          />
          <input
            placeholder="Species"
            value={search.species}
            onChange={(e) => setSearch({ ...search, species: e.target.value })}
          />
          <input
            placeholder="Breed"
            value={search.breed}
            onChange={(e) => setSearch({ ...search, breed: e.target.value })}
          />
          <input
            placeholder="Microchip #"
            value={search.microchip}
            onChange={(e) => setSearch({ ...search, microchip: e.target.value })}
          />
          <input
            placeholder="Owner name"
            value={search.owner}
            onChange={(e) => setSearch({ ...search, owner: e.target.value })}
          />
          <div className="home-links">
            <button type="submit" disabled={!hasAnyTerm(search) || searching}>
              {searching ? 'Searching...' : 'Search'}
            </button>
            <button type="button" onClick={clearSearch}>
              Clear
            </button>
          </div>
        </form>

        <form className="card" onSubmit={handleSubmit}>
          <h2>Add Patient</h2>
          {error && <p className="error">{error}</p>}
          {prefilledClientId && (
            <p className="visit-meta" style={{ margin: 0 }}>
              Owner pre-filled from the client you just added
              {clients.find((c) => c.id === prefilledClientId)
                ? ` — ${clients.find((c) => c.id === prefilledClientId).full_name}`
                : ''}
              .
            </p>
          )}
          <SearchSelect
            items={clients}
            value={form.client_id}
            onChange={(client_id) => setForm({ ...form, client_id })}
            getLabel={(c) => c.full_name}
            getSubLabel={(c) => c.phone}
            placeholder="Select owner..."
          />
          <input
            placeholder="Patient name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <SpeciesField value={form.species} onChange={(species) => setForm({ ...form, species })} />
          <PetAttributeField
            species={form.species}
            value={form.breed}
            onChange={(breed) => setForm({ ...form, breed })}
            catOptions={CAT_BREEDS}
            dogOptions={DOG_BREEDS}
            placeholder="Breed"
          />
          <PetAttributeField
            species={form.species}
            value={form.color}
            onChange={(color) => setForm({ ...form, color })}
            catOptions={CAT_COLORS}
            dogOptions={DOG_COLORS}
            placeholder="Color"
          />
          <input
            type="date"
            value={form.date_of_birth}
            onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
          />
          <select value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })} required>
            <option value="" disabled>
              Sex...
            </option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="male_castrated">Male (Castrated)</option>
            <option value="female_spayed">Female (Spayed)</option>
            <option value="unknown">Unknown</option>
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
          <label className="patient-form-date-field">
            Microchip implanted
            <input
              type="date"
              value={form.microchip_implanted_at}
              onChange={(e) => setForm({ ...form, microchip_implanted_at: e.target.value })}
            />
          </label>
          <label className="patient-form-date-field">
            Last vaccination given
            <input
              type="date"
              value={form.last_vaccination_date}
              onChange={(e) => setForm({ ...form, last_vaccination_date: e.target.value })}
            />
          </label>
          <button type="submit" disabled={submitting || clients.length === 0}>
            {submitting ? 'Saving...' : 'Add Patient'}
          </button>
          {clients.length === 0 && <p>Add a client first.</p>}
        </form>
      </div>

      {!hasSearched ? (
        <p className="visit-meta">Search above to find a patient — nothing loads until you do.</p>
      ) : (
        <>
          <h2>Results ({results.length})</h2>
          {results.length === 0 ? (
            <p>No patients match that search.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Patient #</th>
                  <th>Name</th>
                  <th>Species</th>
                  <th>Breed</th>
                  <th>Color</th>
                  <th>Owner</th>
                  <th>Weight (kg)</th>
                  <th>Microchip #</th>
                  <th>Deceased</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {results.map((p) =>
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
                        <SpeciesField
                          value={editForm.species}
                          onChange={(species) => setEditForm({ ...editForm, species })}
                        />
                      </td>
                      <td>
                        <PetAttributeField
                          species={editForm.species}
                          value={editForm.breed}
                          onChange={(breed) => setEditForm({ ...editForm, breed })}
                          catOptions={CAT_BREEDS}
                          dogOptions={DOG_BREEDS}
                          placeholder="Breed"
                        />
                      </td>
                      <td>
                        <PetAttributeField
                          species={editForm.species}
                          value={editForm.color}
                          onChange={(color) => setEditForm({ ...editForm, color })}
                          catOptions={CAT_COLORS}
                          dogOptions={DOG_COLORS}
                          placeholder="Color"
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
                          placeholder="Microchip #"
                          value={editForm.microchip_number}
                          onChange={(e) =>
                            setEditForm({ ...editForm, microchip_number: e.target.value })
                          }
                        />
                        <input
                          type="date"
                          title="Microchip implantation date"
                          value={editForm.microchip_implanted_at}
                          onChange={(e) =>
                            setEditForm({ ...editForm, microchip_implanted_at: e.target.value })
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
                        <a
                          href={`/patients/${p.id}`}
                          style={p.deceased ? { textDecoration: 'line-through' } : undefined}
                        >
                          {p.name}
                        </a>
                      </td>
                      <td>{p.species}</td>
                      <td>{p.breed}</td>
                      <td>{p.color || '—'}</td>
                      <td>
                        <a href={`/clients/${p.client_id}`}>{p.clients?.full_name}</a>
                      </td>
                      <td>{p.current_weight_kg}</td>
                      <td>
                        {p.microchip_number || '—'}
                        {p.microchip_number && p.microchip_implanted_at && (
                          <span className="visit-meta"> ({p.microchip_implanted_at})</span>
                        )}
                      </td>
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
          )}
        </>
      )}
    </div>
  );
}

export default function PatientsPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <PatientsPageInner />
    </Suspense>
  );
}
