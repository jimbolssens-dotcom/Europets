// app/rooms/page.jsx
// Room list + create form, with inline edit and delete.

'use client';

import { useEffect, useState } from 'react';

const emptyForm = { name: '', type: 'consult' };

export default function RoomsPage() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [rowError, setRowError] = useState(null);

  const loadRooms = () =>
    fetch('/api/rooms')
      .then((res) => res.json())
      .then((data) => {
        setRooms(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    loadRooms();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Failed to create room');
    } else {
      setForm(emptyForm);
      loadRooms();
    }
    setSubmitting(false);
  }

  function startEdit(room) {
    setEditingId(room.id);
    setEditForm({ name: room.name, type: room.type });
    setRowError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setRowError(null);
  }

  async function saveEdit(id) {
    setRowError(null);
    const res = await fetch(`/api/rooms/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    const data = await res.json();

    if (!res.ok) {
      setRowError(data.error || 'Failed to save room');
    } else {
      setEditingId(null);
      loadRooms();
    }
  }

  async function deleteRoom(room) {
    if (!confirm(`Delete room "${room.name}"? This cannot be undone.`)) return;
    setRowError(null);

    const res = await fetch(`/api/rooms/${room.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Failed to delete room');
    } else {
      loadRooms();
    }
  }

  if (loading) return <p>Loading rooms...</p>;

  return (
    <div>
      <h1>Rooms</h1>
      {rowError && <p className="error">{rowError}</p>}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((r) =>
            editingId === r.id ? (
              <tr key={r.id}>
                <td>
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    value={editForm.type}
                    onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                  >
                    <option value="consult">Consult</option>
                    <option value="surgery">Surgery</option>
                  </select>
                </td>
                <td>
                  <button type="button" onClick={() => saveEdit(r.id)}>
                    Save
                  </button>
                  <button type="button" onClick={cancelEdit}>
                    Cancel
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.type}</td>
                <td>
                  <button type="button" onClick={() => startEdit(r)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => deleteRoom(r)}>
                    Delete
                  </button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>

      <form className="card" onSubmit={handleSubmit}>
        <h2>Add Room</h2>
        {error && <p className="error">{error}</p>}
        <input
          placeholder="Room name (e.g. Room 1, Surgery)"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
        >
          <option value="consult">Consult</option>
          <option value="surgery">Surgery</option>
        </select>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Add Room'}
        </button>
      </form>
    </div>
  );
}
