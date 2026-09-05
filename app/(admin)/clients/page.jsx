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
import { phoneSearchDigits } from '@/lib/phoneMatch';
import ClientPhonesEditor, { emptyPhoneRow, toEditableRow } from '@/app/_components/ClientPhonesEditor';

const emptyForm = {
  full_name: '',
  phones: [emptyPhoneRow(true)],
  emirates_id: '',
  trn: '',
  email: '',
  address: '',
};
const emptySearch = { client_number: '', name: '', phone: '', emirates_id: '', email: '', address: '' };

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
  const [possibleDuplicates, setPossibleDuplicates] = useState(null);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
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

  // Any edit to the Add Client form invalidates whatever duplicate check
  // ran against the previous values.
  function updateForm(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
    setPossibleDuplicates(null);
  }

  // Cross-references what's typed so far against existing clients by
  // phone (formatting-normalized, any number on the form — not just
  // whichever is picked for WhatsApp), Emirates ID, and name — a match on
  // any of these is a strong sign this "new" client already exists.
  async function findPossibleDuplicates() {
    const allDigits = [...new Set(form.phones.map((p) => phoneSearchDigits(p.phone)).filter(Boolean))];
    const emiratesId = form.emirates_id.trim();
    const name = form.full_name.trim();

    const requests = [];
    for (const digits of allDigits) {
      requests.push(fetch(`/api/clients?phone=${digits}`).then((res) => res.json()));
    }
    if (emiratesId) requests.push(fetch(`/api/clients?emirates_id=${encodeURIComponent(emiratesId)}`).then((res) => res.json()));
    if (name) requests.push(fetch(`/api/clients?name=${encodeURIComponent(name)}`).then((res) => res.json()));
    if (requests.length === 0) return [];

    const results = await Promise.all(requests);
    const byId = new Map();
    for (const list of results) {
      for (const c of Array.isArray(list) ? list : []) byId.set(c.id, c);
    }
    return [...byId.values()];
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!possibleDuplicates) {
      setCheckingDuplicates(true);
      const matches = await findPossibleDuplicates();
      setCheckingDuplicates(false);
      if (matches.length > 0) {
        setPossibleDuplicates(matches);
        return;
      }
    }

    await createClient();
  }

  async function createClient() {
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

  function useExistingClient(clientId) {
    router.push(`/patients?client_id=${clientId}`);
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
    const phones = (client.client_phones || []).map(toEditableRow);
    setEditForm({
      full_name: client.full_name,
      phones: phones.length > 0 ? phones : [emptyPhoneRow(true)],
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
      body: JSON.stringify(editForm),
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
            onChange={(e) => updateForm({ full_name: e.target.value })}
          />
          <input
            placeholder="Emirates ID"
            value={form.emirates_id}
            onChange={(e) => updateForm({ emirates_id: e.target.value })}
          />
          <input
            placeholder="TRN (only if a VAT-registered business)"
            value={form.trn}
            onChange={(e) => updateForm({ trn: e.target.value })}
          />
          <ClientPhonesEditor phones={form.phones} onChange={(phones) => updateForm({ phones })} groupName="new" />
          <input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => updateForm({ email: e.target.value })}
          />
          <input
            placeholder="Address"
            value={form.address}
            onChange={(e) => updateForm({ address: e.target.value })}
          />

          {possibleDuplicates?.length > 0 && (
            <div className="possible-duplicate-warning">
              <p>⚠️ This might already be a client — matched by phone, Emirates ID, or name:</p>
              <ul>
                {possibleDuplicates.map((c) => (
                  <li key={c.id}>
                    <a href={`/clients/${c.id}`} target="_blank" rel="noreferrer">
                      {c.full_name}
                    </a>{' '}
                    · {c.phone || 'no phone'}
                    {c.emirates_id && ` · ID ${c.emirates_id}`}
                    {c.email && ` · ${c.email}`}
                    <button type="button" onClick={() => useExistingClient(c.id)}>
                      Use this client instead
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button type="submit" disabled={submitting || checkingDuplicates}>
            {checkingDuplicates
              ? 'Checking for duplicates...'
              : submitting
                ? 'Saving...'
                : possibleDuplicates?.length > 0
                  ? 'Create as New Client Anyway'
                  : 'Add Client'}
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
                  <th>Phone Numbers</th>
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
                        <ClientPhonesEditor
                          phones={editForm.phones}
                          onChange={(phones) => setEditForm({ ...editForm, phones })}
                          groupName={`edit-${c.id}`}
                        />
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
                      <td>
                        {(c.client_phones || []).length === 0
                          ? c.phone || '—'
                          : c.client_phones.map((p, i) => (
                              <div key={i}>
                                {p.phone} ({p.label}
                                {p.is_whatsapp ? ' · WhatsApp' : ''})
                              </div>
                            ))}
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
