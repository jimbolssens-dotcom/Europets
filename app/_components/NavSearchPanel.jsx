// app/_components/NavSearchPanel.jsx
// Nav "Search" dropdown — two independent multi-field searches, one for
// clients (client #, name, phone) and one for patients (patient #, name,
// breed, microchip), reachable from any page. Reuses the same filtered
// GET /api/clients and GET /api/patients endpoints (and the same AND-all-
// filled-fields semantics) as the Clients/Patients pages' own search
// forms — those pages are unchanged and still have the fuller field set
// (Emirates ID, email, address, species, owner) for when a vet is already
// there; "Open ... page" below hands off to them.

'use client';

import { useEffect, useState } from 'react';

const emptyClientSearch = { client_number: '', name: '', phone: '' };
const emptyPatientSearch = { patient_number: '', name: '', breed: '', microchip: '' };

function hasAnyTerm(search) {
  return Object.values(search).some((v) => v.trim());
}

export default function NavSearchPanel() {
  const [clientSearch, setClientSearch] = useState(emptyClientSearch);
  const [patientSearch, setPatientSearch] = useState(emptyPatientSearch);
  const [clientResults, setClientResults] = useState([]);
  const [patientResults, setPatientResults] = useState([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [patientLoading, setPatientLoading] = useState(false);

  useEffect(() => {
    if (!hasAnyTerm(clientSearch)) {
      setClientResults([]);
      return;
    }
    setClientLoading(true);
    const handle = setTimeout(() => {
      const params = new URLSearchParams();
      if (clientSearch.client_number.trim()) params.set('client_number', clientSearch.client_number.trim());
      if (clientSearch.name.trim()) params.set('name', clientSearch.name.trim());
      if (clientSearch.phone.trim()) params.set('phone', clientSearch.phone.trim());
      fetch(`/api/clients?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => {
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
      const params = new URLSearchParams();
      if (patientSearch.patient_number.trim()) params.set('patient_number', patientSearch.patient_number.trim());
      if (patientSearch.name.trim()) params.set('name', patientSearch.name.trim());
      if (patientSearch.breed.trim()) params.set('breed', patientSearch.breed.trim());
      if (patientSearch.microchip.trim()) params.set('microchip', patientSearch.microchip.trim());
      fetch(`/api/patients?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => {
          setPatientResults(Array.isArray(data) ? data.slice(0, 8) : []);
          setPatientLoading(false);
        });
    }, 300);
    return () => clearTimeout(handle);
  }, [patientSearch]);

  return (
    <div className="nav-panel">
      <div className="nav-panel-cols">
        <div className="nav-panel-col">
          <h3>Search Clients</h3>
          <div className="nav-panel-field-row">
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
          <div className="nav-panel-results">
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
          <a href="/clients" className="search-view-all">
            Open Clients page &rarr;
          </a>
        </div>

        <div className="nav-panel-col">
          <h3>Search Patients</h3>
          <div className="nav-panel-field-row four">
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
          <div className="nav-panel-results">
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
          <a href="/patients" className="search-view-all">
            Open Patients page &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}
