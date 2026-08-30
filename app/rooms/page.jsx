// app/rooms/page.jsx
// Room list + create form. Rooms are the bookable spaces used by appointments.

'use client';

import { useEffect, useState } from 'react';

const emptyForm = { name: '', type: 'consult' };

export default function RoomsPage() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

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

  if (loading) return <p>Loading rooms...</p>;

  return (
    <div>
      <h1>Rooms</h1>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r.type}</td>
            </tr>
          ))}
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
