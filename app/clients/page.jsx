// app/clients/page.jsx
// Client list + create form, with inline edit and delete.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const emptyForm = { full_name: '', phone: '', email: '', address: '' };

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [rowError, setRowError] = useState(null);

  const loadClients = () =>
    fetch('/api/clients')
      .then((res) => res.json())
      .then((data) => {
        setClients(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    loadClients();

    const channel = supabase
      .channel('clients-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clients' },
        () => loadClients()
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

    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Failed to create client');
    } else {
      setForm(emptyForm);
      loadClients();
    }
    setSubmitting(false);
  }

  function startEdit(client) {
    setEditingId(client.id);
    setEditForm({
      full_name: client.full_name,
      phone: client.phone || '',
      email: client.email || '',
      address: client.address || '',
    });
    setRowError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setRowError(null);
  }

  async function saveEdit(id) {
    setRowError(null);
    const res = await fetch(`/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    const data = await res.json();

    if (!res.ok) {
      setRowError(data.error || 'Failed to save client');
    } else {
      setEditingId(null);
      loadClients();
    }
  }

  async function deleteClient(client) {
    if (!confirm(`Delete ${client.full_name}? This cannot be undone.`)) return;
    setRowError(null);

    const res = await fetch(`/api/clients/${client.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Failed to delete client');
    } else {
      loadClients();
    }
  }

  if (loading) return <p>Loading clients...</p>;

  return (
    <div>
      <h1>Clients</h1>
      {rowError && <p className="error">{rowError}</p>}
      <table>
        <thead>
          <tr>
            <th>Client #</th>
            <th>Name</th>
            <th>Phone</th>
            <th>Email</th>
            <th>Address</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) =>
            editingId === c.id ? (
              <tr key={c.id}>
                <td>{c.client_number}</td>
                <td>
                  <input
                    value={editForm.full_name}
                    onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  />
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
                    value={editForm.address}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  />
                </td>
                <td>
                  <button type="button" onClick={() => saveEdit(c.id)}>
                    Save
                  </button>
                  <button type="button" onClick={cancelEdit}>
                    Cancel
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={c.id}>
                <td>{c.client_number}</td>
                <td>
                  <a href={`/clients/${c.id}`}>{c.full_name}</a>
                </td>
                <td>{c.phone}</td>
                <td>{c.email}</td>
                <td>{c.address}</td>
                <td>
                  <button type="button" onClick={() => startEdit(c)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => deleteClient(c)}>
                    Delete
                  </button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>

      <form className="card" onSubmit={handleSubmit}>
        <h2>Add Client</h2>
        {error && <p className="error">{error}</p>}
        <input
          placeholder="Full name"
          required
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
        />
        <input
          placeholder="Phone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <input
          placeholder="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          placeholder="Address"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Add Client'}
        </button>
      </form>
    </div>
  );
}
