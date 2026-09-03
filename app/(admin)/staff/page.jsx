// app/staff/page.jsx
// Staff list + create form, with inline edit and delete.

'use client';

import { useEffect, useState } from 'react';

const emptyForm = { full_name: '', role: 'vet', email: '', color: '' };

export default function StaffPage() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [rowError, setRowError] = useState(null);

  const loadStaff = () =>
    fetch('/api/staff')
      .then((res) => res.json())
      .then((data) => {
        setStaff(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    loadStaff();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Failed to create staff member');
    } else {
      setForm(emptyForm);
      loadStaff();
    }
    setSubmitting(false);
  }

  function startEdit(member) {
    setEditingId(member.id);
    setEditForm({
      full_name: member.full_name,
      role: member.role,
      email: member.email || '',
      color: member.color || '',
    });
    setRowError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setRowError(null);
  }

  async function saveEdit(id) {
    setRowError(null);
    const res = await fetch(`/api/staff/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    const data = await res.json();

    if (!res.ok) {
      setRowError(data.error || 'Failed to save staff member');
    } else {
      setEditingId(null);
      loadStaff();
    }
  }

  async function deleteStaff(member) {
    if (!confirm(`Delete ${member.full_name}? This cannot be undone.`)) return;
    setRowError(null);

    const res = await fetch(`/api/staff/${member.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Failed to delete staff member');
    } else {
      loadStaff();
    }
  }

  if (loading) return <p>Loading staff...</p>;

  return (
    <div>
      <h1>Staff</h1>
      <p>
        <a href="/staff/roster">📅 Staff Roster</a>
      </p>
      {rowError && <p className="error">{rowError}</p>}
      <div className="split">
      <div className="split-main">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Email</th>
            <th>Color</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) =>
            editingId === s.id ? (
              <tr key={s.id}>
                <td>
                  <input
                    value={editForm.full_name}
                    onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  >
                    <option value="vet">Vet</option>
                    <option value="tech">Tech</option>
                    <option value="reception">Reception</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="color"
                    title="Appointment schedule color"
                    value={editForm.color || '#e6186d'}
                    onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                  />
                </td>
                <td>
                  <button type="button" onClick={() => saveEdit(s.id)}>
                    Save
                  </button>
                  <button type="button" onClick={cancelEdit}>
                    Cancel
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={s.id}>
                <td>{s.full_name}</td>
                <td>{s.role}</td>
                <td>{s.email}</td>
                <td>
                  {s.color && (
                    <span
                      className="staff-color-swatch"
                      style={{ background: s.color }}
                      title={s.color}
                    />
                  )}
                </td>
                <td>
                  <button type="button" onClick={() => startEdit(s)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => deleteStaff(s)}>
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
        <h2>Add Staff</h2>
        {error && <p className="error">{error}</p>}
        <input
          placeholder="Full name"
          required
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
        />
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        >
          <option value="vet">Vet</option>
          <option value="tech">Tech</option>
          <option value="reception">Reception</option>
          <option value="admin">Admin</option>
        </select>
        <input
          placeholder="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <label>
          Appointment schedule color
          <input
            type="color"
            value={form.color || '#e6186d'}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Add Staff'}
        </button>
      </form>
      </div>
      </div>
    </div>
  );
}
