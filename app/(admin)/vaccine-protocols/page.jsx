// app/vaccine-protocols/page.jsx
// The clinic's standard vaccination catalog — list + create form, with
// inline edit and an active/inactive toggle (like Goods & Services, retired
// protocols stay out of new records without deleting history that used
// them). Species-tagged so the patient-side Add Vaccination form can filter
// to just what makes sense for a cat vs a dog.

'use client';

import { useEffect, useState } from 'react';

const emptyForm = { name: '', species: 'cat', core: true, interval_months: '12' };

export default function VaccineProtocolsPage() {
  const [protocols, setProtocols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [rowError, setRowError] = useState(null);

  const loadProtocols = () =>
    fetch('/api/vaccine-protocols')
      .then((res) => res.json())
      .then((data) => {
        setProtocols(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    loadProtocols();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/vaccine-protocols', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, interval_months: Number(form.interval_months) }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Failed to add protocol');
    } else {
      setForm(emptyForm);
      loadProtocols();
    }
    setSubmitting(false);
  }

  function startEdit(p) {
    setEditingId(p.id);
    setEditForm({
      name: p.name,
      species: p.species,
      core: p.core,
      interval_months: String(p.interval_months),
    });
    setRowError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setRowError(null);
  }

  async function saveEdit(id) {
    setRowError(null);
    const res = await fetch(`/api/vaccine-protocols/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editForm, interval_months: Number(editForm.interval_months) }),
    });
    const data = await res.json();

    if (!res.ok) {
      setRowError(data.error || 'Failed to save protocol');
    } else {
      setEditingId(null);
      loadProtocols();
    }
  }

  async function toggleActive(p) {
    await fetch(`/api/vaccine-protocols/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !p.active }),
    });
    loadProtocols();
  }

  async function deleteProtocol(p) {
    if (!confirm(`Delete "${p.name}" (${p.species})? This cannot be undone.`)) return;
    setRowError(null);

    const res = await fetch(`/api/vaccine-protocols/${p.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      setRowError(data.error || 'Failed to delete protocol');
    } else {
      loadProtocols();
    }
  }

  if (loading) return <p>Loading vaccine protocols...</p>;

  return (
    <div>
      <h1>Vaccine Protocols</h1>
      <p className="visit-meta">
        The standard vaccines offered per species — shown on a patient&apos;s Add Vaccination form,
        filtered to their species automatically. Deactivate a protocol you no longer offer instead
        of deleting it, so past records stay intact.
      </p>
      {rowError && <p className="error">{rowError}</p>}
      <div className="split">
        <div className="split-main">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Species</th>
                <th>Core?</th>
                <th>Interval</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {protocols.map((p) =>
                editingId === p.id ? (
                  <tr key={p.id}>
                    <td>
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        value={editForm.species}
                        onChange={(e) => setEditForm({ ...editForm, species: e.target.value })}
                      >
                        <option value="cat">Cat</option>
                        <option value="dog">Dog</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={editForm.core ? 'core' : 'optional'}
                        onChange={(e) => setEditForm({ ...editForm, core: e.target.value === 'core' })}
                      >
                        <option value="core">Core</option>
                        <option value="optional">Optional</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        style={{ width: '5rem' }}
                        value={editForm.interval_months}
                        onChange={(e) => setEditForm({ ...editForm, interval_months: e.target.value })}
                      />{' '}
                      mo
                    </td>
                    <td>{p.active ? 'active' : 'inactive'}</td>
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
                    <td>{p.name}</td>
                    <td>{p.species}</td>
                    <td>{p.core ? 'Core' : 'Optional'}</td>
                    <td>
                      {p.interval_months} {p.interval_months === 12 ? '(annual)' : 'mo'}
                    </td>
                    <td>{p.active ? 'active' : 'inactive'}</td>
                    <td>
                      <button type="button" onClick={() => startEdit(p)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => toggleActive(p)}>
                        {p.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button type="button" onClick={() => deleteProtocol(p)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>

        <div className="split-aside">
          <form className="card" onSubmit={handleSubmit}>
            <h2>Add Protocol</h2>
            {error && <p className="error">{error}</p>}
            <input
              placeholder="Name (e.g. Cat Flu)"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <select value={form.species} onChange={(e) => setForm({ ...form, species: e.target.value })}>
              <option value="cat">Cat</option>
              <option value="dog">Dog</option>
            </select>
            <select
              value={form.core ? 'core' : 'optional'}
              onChange={(e) => setForm({ ...form, core: e.target.value === 'core' })}
            >
              <option value="core">Core (routine)</option>
              <option value="optional">Optional</option>
            </select>
            <input
              type="number"
              min="1"
              placeholder="Interval (months)"
              value={form.interval_months}
              onChange={(e) => setForm({ ...form, interval_months: e.target.value })}
            />
            <button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : 'Add Protocol'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
