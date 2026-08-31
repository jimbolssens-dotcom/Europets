// app/clients/page.jsx
// Client list + create form, with inline edit and delete.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const emptyForm = { full_name: '', phone: '+971', phone2: '+971', phone2_label: '', email: '', address: '' };

const PHONE2_LABELS = [
  { value: 'husband', label: 'Husband' },
  { value: 'wife', label: 'Wife' },
  { value: 'maid', label: 'Maid' },
  { value: 'driver', label: 'Driver' },
  { value: 'other', label: 'Other' },
];

function phone2LabelText(value) {
  return PHONE2_LABELS.find((o) => o.value === value)?.label || value;
}

// The +971 default is just a typing shortcut — if it's left untouched (no
// digits typed beyond the country code), treat the field as not filled in
// rather than saving a bare "+971" as someone's phone number.
function normalizePhone(value) {
  const digits = (value || '').replace(/\D/g, '');
  return digits === '' || digits === '971' ? '' : value;
}

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
      body: JSON.stringify({
        ...form,
        phone: normalizePhone(form.phone),
        phone2: normalizePhone(form.phone2),
      }),
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
      phone: client.phone || '+971',
      phone2: client.phone2 || '+971',
      phone2_label: client.phone2_label || '',
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
      body: JSON.stringify({
        ...editForm,
        phone: normalizePhone(editForm.phone),
        phone2: normalizePhone(editForm.phone2),
      }),
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
      <div className="split">
      <div className="split-main">
      <table>
        <thead>
          <tr>
            <th>Client #</th>
            <th>Name</th>
            <th>Phone</th>
            <th>2nd Phone</th>
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
                    placeholder="Phone"
                    value={editForm.phone2}
                    onChange={(e) => setEditForm({ ...editForm, phone2: e.target.value })}
                  />
                  <select
                    value={editForm.phone2_label}
                    onChange={(e) => setEditForm({ ...editForm, phone2_label: e.target.value })}
                  >
                    <option value="">Whose?</option>
                    {PHONE2_LABELS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
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
                <td>
                  {c.phone2
                    ? `${c.phone2}${c.phone2_label ? ` (${phone2LabelText(c.phone2_label)})` : ''}`
                    : ''}
                </td>
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
      </div>

      <div className="split-aside">
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
          placeholder="2nd phone (optional)"
          value={form.phone2}
          onChange={(e) => setForm({ ...form, phone2: e.target.value })}
        />
        <select
          value={form.phone2_label}
          onChange={(e) => setForm({ ...form, phone2_label: e.target.value })}
        >
          <option value="">2nd phone belongs to...</option>
          {PHONE2_LABELS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
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
      </div>
    </div>
  );
}
