// app/staff/page.jsx
// Staff list + create form. Vets are the bookable providers used by appointments.

'use client';

import { useEffect, useState } from 'react';

const emptyForm = { full_name: '', role: 'vet', email: '' };

export default function StaffPage() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

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

  if (loading) return <p>Loading staff...</p>;

  return (
    <div>
      <h1>Staff</h1>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Email</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id}>
              <td>{s.full_name}</td>
              <td>{s.role}</td>
              <td>{s.email}</td>
            </tr>
          ))}
        </tbody>
      </table>

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
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Add Staff'}
        </button>
      </form>
    </div>
  );
}
