// app/clients/page.jsx
// Client search + create, with inline edit and delete. The client list can
// grow large, so nothing loads until a search is run — no full-table dump
// on page load. Search and Add Client sit side by side; results appear
// below once you search.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { uploadAttachment } from '@/lib/attachments';
import ScanIdButton from '@/app/_components/ScanIdButton';

const emptyForm = {
  full_name: '',
  phone: '+971',
  phone2: '+971',
  phone2_label: '',
  emirates_id: '',
  trn: '',
  email: '',
  address: '',
};
const emptySearch = { client_number: '', name: '', phone: '', emirates_id: '', email: '', address: '' };

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

function buildQuery(search) {
  const params = new URLSearchParams();
  if (search.client_number.trim()) params.set('client_number', search.client_number.trim());
  if (search.name.trim()) params.set('name', search.name.trim());
  if (search.phone.trim()) params.set('phone', search.phone.trim());
  if (search.emirates_id.trim()) params.set('emirates_id', search.emirates_id.trim());
  if (search.email.trim()) params.set('email', search.email.trim());
  if (search.address.trim()) params.set('address', search.address.trim());
  return params.toString();
}

function hasAnyTerm(search) {
  return Object.values(search).some((v) => v.trim());
}

export default function ClientsPage() {
  const router = useRouter();
  const [results, setResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState(emptySearch);

  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [idScanFile, setIdScanFile] = useState(null); // held until the new client exists
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [rowError, setRowError] = useState(null);

  const searchRef = useRef(search);
  const hasSearchedRef = useRef(hasSearched);
  searchRef.current = search;
  hasSearchedRef.current = hasSearched;

  const runSearch = (searchValues) => {
    setSearching(true);
    fetch(`/api/clients?${buildQuery(searchValues)}`)
      .then((res) => res.json())
      .then((data) => {
        setResults(Array.isArray(data) ? data : []);
        setHasSearched(true);
        setSearching(false);
      });
  };

  useEffect(() => {
    const channel = supabase
      .channel('clients-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => {
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
      setSubmitting(false);
    } else {
      if (idScanFile) {
        uploadAttachment({ entityType: 'client', entityId: data.id, file: idScanFile }).catch(() => {});
      }
      // A client always gets added alongside their first patient — go
      // straight there instead of leaving the vet to find Patients + pick
      // the owner they just typed in a second ago.
      router.push(`/patients?client_id=${data.id}`);
    }
  }

  function handleAddScanned({ full_name, emirates_id, file }) {
    setForm((prev) => ({
      ...prev,
      full_name: full_name || prev.full_name,
      emirates_id: emirates_id || prev.emirates_id,
    }));
    setIdScanFile(file);
  }

  function handleEditScanned(clientId, { full_name, emirates_id, file }) {
    setEditForm((prev) => ({
      ...prev,
      full_name: full_name || prev.full_name,
      emirates_id: emirates_id || prev.emirates_id,
    }));
    if (file) {
      uploadAttachment({ entityType: 'client', entityId: clientId, file }).catch(() => {});
    }
  }

  function startEdit(client) {
    setEditingId(client.id);
    setEditForm({
      full_name: client.full_name,
      phone: client.phone || '+971',
      phone2: client.phone2 || '+971',
      phone2_label: client.phone2_label || '',
      emirates_id: client.emirates_id || '',
      trn: client.trn || '',
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
      runSearch(search);
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
      runSearch(search);
    }
  }

  return (
    <div>
      <h1>Clients</h1>
      {rowError && <p className="error">{rowError}</p>}

      <div className="two-col">
        <form className="card" onSubmit={handleSearchSubmit}>
          <h2>Search Clients</h2>
          <input
            placeholder="Client #"
            value={search.client_number}
            onChange={(e) => setSearch({ ...search, client_number: e.target.value })}
          />
          <input
            placeholder="Name"
            value={search.name}
            onChange={(e) => setSearch({ ...search, name: e.target.value })}
          />
          <input
            placeholder="Phone"
            value={search.phone}
            onChange={(e) => setSearch({ ...search, phone: e.target.value })}
          />
          <input
            placeholder="Emirates ID"
            value={search.emirates_id}
            onChange={(e) => setSearch({ ...search, emirates_id: e.target.value })}
          />
          <input
            placeholder="Email"
            value={search.email}
            onChange={(e) => setSearch({ ...search, email: e.target.value })}
          />
          <input
            placeholder="Address"
            value={search.address}
            onChange={(e) => setSearch({ ...search, address: e.target.value })}
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
          <h2>Add Client</h2>
          {error && <p className="error">{error}</p>}
          <ScanIdButton onScanned={handleAddScanned} />
          <p className="visit-meta" style={{ margin: 0 }}>
            Scans the card and fills in name + Emirates ID below.
            {idScanFile && ' Photo ready — will attach once the client is saved.'}
          </p>
          <input
            placeholder="Full name"
            required
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
          <input
            placeholder="Emirates ID"
            value={form.emirates_id}
            onChange={(e) => setForm({ ...form, emirates_id: e.target.value })}
          />
          <input
            placeholder="TRN (only if a VAT-registered business)"
            value={form.trn}
            onChange={(e) => setForm({ ...form, trn: e.target.value })}
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

      {!hasSearched ? (
        <p className="visit-meta">Search above to find a client — nothing loads until you do.</p>
      ) : (
        <>
          <h2>Results ({results.length})</h2>
          {results.length === 0 ? (
            <p>No clients match that search.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Client #</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>2nd Phone</th>
                  <th>Emirates ID</th>
                  <th>Email</th>
                  <th>Address</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {results.map((c) =>
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
                          placeholder="Emirates ID"
                          value={editForm.emirates_id}
                          onChange={(e) => setEditForm({ ...editForm, emirates_id: e.target.value })}
                        />
                        <ScanIdButton
                          label="📷"
                          uploadLabel="🖼️"
                          onScanned={(scanned) => handleEditScanned(c.id, scanned)}
                        />
                        <input
                          placeholder="TRN (business)"
                          value={editForm.trn}
                          onChange={(e) => setEditForm({ ...editForm, trn: e.target.value })}
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
                      <td>
                        {c.phone2
                          ? `${c.phone2}${c.phone2_label ? ` (${phone2LabelText(c.phone2_label)})` : ''}`
                          : ''}
                      </td>
                      <td>{c.emirates_id || '—'}</td>
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
          )}
        </>
      )}
    </div>
  );
}
