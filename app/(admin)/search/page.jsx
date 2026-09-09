// app/search/page.jsx
// The Search tab — a normal page like every other nav tab (Invite,
// Appointments, ...), not a dropdown over whatever page you were on.
// Two independent multi-field searches, one for clients (client #, name,
// phone) and one for patients (patient #, name, breed, microchip), each
// AND-combining whatever fields are filled — via the same filtered
// GET /api/clients and GET /api/patients endpoints the old standalone
// Clients/Patients list pages used (now removed — this page plus /add
// cover everything those did).
//
// Arriving here with ?q= (from the nav's own combined SearchBox's "View
// all results" link) instead shows that single-query's results across
// both clients and patients, same as this page always has.

'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const emptyClientSearch = { client_number: '', name: '', phone: '' };
const emptyPatientSearch = { patient_number: '', name: '', breed: '', microchip: '' };

function hasAnyTerm(search) {
  return Object.values(search).some((v) => v.trim());
}

function QuickSearchResults({ q }) {
  const [results, setResults] = useState({ clients: [], patients: [] });
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!q.trim()) {
      setResults({ clients: [], patients: [] });
      return;
    }
    setLoading(true);
    const requestId = ++requestIdRef.current;
    fetch(`/api/search?q=${encodeURIComponent(q)}&limit=50`)
      .then((res) => res.json())
      .then((data) => {
        // A slower, older request (e.g. a broader earlier query with more
        // rows to match) can resolve after a newer, narrower one — only the
        // most recently issued request is allowed to update the results, or
        // the page can flash a stale, non-matching list right after typing.
        if (requestId !== requestIdRef.current) return;
        setResults({ clients: data.clients || [], patients: data.patients || [] });
        setLoading(false);
      });
  }, [q]);

  return (
    <div>
      <h1>Search Results</h1>
      <p className="visit-meta">Showing results for &quot;{q}&quot;</p>
      {loading && <p>Searching...</p>}

      {!loading && (
        <>
          <h2>Clients ({results.clients.length})</h2>
          {results.clients.length === 0 ? (
            <p>No matching clients.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Client #</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {results.clients.map((c) => (
                  <tr key={c.id}>
                    <td>{c.client_number}</td>
                    <td>
                      <a href={`/clients/${c.id}`}>{c.full_name}</a>
                    </td>
                    <td>{c.phone}</td>
                    <td>{c.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2>Patients ({results.patients.length})</h2>
          {results.patients.length === 0 ? (
            <p>No matching patients.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Patient #</th>
                  <th>Name</th>
                  <th>Species</th>
                  <th>Breed</th>
                  <th>Microchip</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {results.patients.map((p) => (
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
                    <td>{p.microchip_number}</td>
                    <td>
                      <a href={`/clients/${p.clients?.id}`}>{p.clients?.full_name}</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

function FieldSearch() {
  const [clientSearch, setClientSearch] = useState(emptyClientSearch);
  const [patientSearch, setPatientSearch] = useState(emptyPatientSearch);
  const [clientResults, setClientResults] = useState([]);
  const [patientResults, setPatientResults] = useState([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [patientLoading, setPatientLoading] = useState(false);
  const clientRequestIdRef = useRef(0);
  const patientRequestIdRef = useRef(0);

  useEffect(() => {
    if (!hasAnyTerm(clientSearch)) {
      setClientResults([]);
      return;
    }
    setClientLoading(true);
    const handle = setTimeout(() => {
      const requestId = ++clientRequestIdRef.current;
      const params = new URLSearchParams();
      if (clientSearch.client_number.trim()) params.set('client_number', clientSearch.client_number.trim());
      if (clientSearch.name.trim()) params.set('name', clientSearch.name.trim());
      if (clientSearch.phone.trim()) params.set('phone', clientSearch.phone.trim());
      fetch(`/api/clients?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => {
          // Guard against an older, slower search (e.g. a single typed
          // letter matching far more rows than what's typed now) resolving
          // after a newer, more specific one and clobbering its results.
          if (requestId !== clientRequestIdRef.current) return;
          setClientResults(Array.isArray(data) ? data.slice(0, 8) : []);
          setClientLoading(false);
        });
    }, 300);
    return () => clearTimeout(handle);
  }, [clientSearch]);

  useEffect(() => {
    if (!hasAnyTerm(patientSearch)) {
      setPatientResults([]);
      return;
    }
    setPatientLoading(true);
    const handle = setTimeout(() => {
      const requestId = ++patientRequestIdRef.current;
      const params = new URLSearchParams();
      if (patientSearch.patient_number.trim()) params.set('patient_number', patientSearch.patient_number.trim());
      if (patientSearch.name.trim()) params.set('name', patientSearch.name.trim());
      if (patientSearch.breed.trim()) params.set('breed', patientSearch.breed.trim());
      if (patientSearch.microchip.trim()) params.set('microchip', patientSearch.microchip.trim());
      fetch(`/api/patients?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => {
          if (requestId !== patientRequestIdRef.current) return;
          setPatientResults(Array.isArray(data) ? data.slice(0, 8) : []);
          setPatientLoading(false);
        });
    }, 300);
    return () => clearTimeout(handle);
  }, [patientSearch]);

  return (
    <div>
      <h1>Search</h1>
      <div className="two-col">
        <div className="card">
          <h2>Search Clients</h2>
          <div className="field-search-row">
            <input
              placeholder="Client #"
              value={clientSearch.client_number}
              onChange={(e) => setClientSearch({ ...clientSearch, client_number: e.target.value })}
            />
            <input
              placeholder="Name"
              value={clientSearch.name}
              onChange={(e) => setClientSearch({ ...clientSearch, name: e.target.value })}
            />
            <input
              placeholder="Phone"
              value={clientSearch.phone}
              onChange={(e) => setClientSearch({ ...clientSearch, phone: e.target.value })}
            />
          </div>
          <div className="field-search-results">
            {clientLoading && <p className="search-empty">Searching...</p>}
            {!clientLoading && hasAnyTerm(clientSearch) && clientResults.length === 0 && (
              <p className="search-empty">No matching clients.</p>
            )}
            {!clientLoading && !hasAnyTerm(clientSearch) && (
              <p className="search-empty">Type a client # / name / phone to search.</p>
            )}
            {!clientLoading &&
              clientResults.map((c) => (
                <a key={c.id} href={`/clients/${c.id}`} className="search-result">
                  <strong>{c.full_name}</strong>
                  <span>
                    Client #{c.client_number} · {c.phone || 'no phone'}
                  </span>
                </a>
              ))}
          </div>
        </div>

        <div className="card">
          <h2>Search Patients</h2>
          <div className="field-search-row four">
            <input
              placeholder="Patient #"
              value={patientSearch.patient_number}
              onChange={(e) => setPatientSearch({ ...patientSearch, patient_number: e.target.value })}
            />
            <input
              placeholder="Name"
              value={patientSearch.name}
              onChange={(e) => setPatientSearch({ ...patientSearch, name: e.target.value })}
            />
            <input
              placeholder="Breed"
              value={patientSearch.breed}
              onChange={(e) => setPatientSearch({ ...patientSearch, breed: e.target.value })}
            />
            <input
              placeholder="Microchip"
              value={patientSearch.microchip}
              onChange={(e) => setPatientSearch({ ...patientSearch, microchip: e.target.value })}
            />
          </div>
          <div className="field-search-results">
            {patientLoading && <p className="search-empty">Searching...</p>}
            {!patientLoading && hasAnyTerm(patientSearch) && patientResults.length === 0 && (
              <p className="search-empty">No matching patients.</p>
            )}
            {!patientLoading && !hasAnyTerm(patientSearch) && (
              <p className="search-empty">Type a patient # / name / breed / microchip to search.</p>
            )}
            {!patientLoading &&
              patientResults.map((p) => (
                <a key={p.id} href={`/patients/${p.id}`} className="search-result">
                  <strong>{p.name}</strong>
                  <span>
                    #{p.patient_number} · {p.species}
                    {p.breed ? ` · ${p.breed}` : ''} · Owner: {p.clients?.full_name || '—'}
                  </span>
                </a>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchPageContent() {
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';
  return q.trim() ? <QuickSearchResults q={q} /> : <FieldSearch />;
}

export default function SearchPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <SearchPageContent />
    </Suspense>
  );
}
