// app/_components/ClientPatientNumberSearch.jsx
// Same pick-a-client-or-patient contract as ClientOrPatientSearch (hands
// the result back via onPickClient/onPickPatient), but as three separate
// labeled fields — Client #, Patient #, Client Name — instead of one
// blended box. Built for the Online Payments "Apply to an Invoice" panel,
// where a single free-text box can't tell a client number from a patient
// number. Client #/Patient # go straight to /api/clients?client_number=
// and /api/patients?patient_number= (exact match, same as the main Search
// page's structured fields); Client Name does the usual fuzzy
// /api/clients?name= match.

'use client';

import { useEffect, useRef, useState } from 'react';

export default function ClientPatientNumberSearch({ onPickClient, onPickPatient }) {
  const [clientNumber, setClientNumber] = useState('');
  const [patientNumber, setPatientNumber] = useState('');
  const [clientName, setClientName] = useState('');
  const [results, setResults] = useState({ clients: [], patients: [] });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);
  const requestIdRef = useRef(0);

  const hasTerm = clientNumber.trim() || patientNumber.trim() || clientName.trim();

  useEffect(() => {
    if (!hasTerm) {
      setResults({ clients: [], patients: [] });
      setOpen(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      const requestId = ++requestIdRef.current;
      Promise.all([
        clientNumber.trim()
          ? fetch(`/api/clients?client_number=${encodeURIComponent(clientNumber.trim())}`).then((res) => res.json())
          : Promise.resolve([]),
        clientName.trim()
          ? fetch(`/api/clients?name=${encodeURIComponent(clientName.trim())}`).then((res) => res.json())
          : Promise.resolve([]),
        patientNumber.trim()
          ? fetch(`/api/patients?patient_number=${encodeURIComponent(patientNumber.trim())}`).then((res) => res.json())
          : Promise.resolve([]),
      ]).then(([clientsByNumber, clientsByName, patientsByNumber]) => {
        // A slower, older search can resolve after a newer, more specific
        // one — only apply the most recently issued request's results.
        if (requestId !== requestIdRef.current) return;
        const clientMap = new Map();
        for (const c of [...(Array.isArray(clientsByNumber) ? clientsByNumber : []), ...(Array.isArray(clientsByName) ? clientsByName : [])]) {
          clientMap.set(c.id, c);
        }
        setResults({
          clients: Array.from(clientMap.values()),
          patients: Array.isArray(patientsByNumber) ? patientsByNumber : [],
        });
        setOpen(true);
        setLoading(false);
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [clientNumber, patientNumber, clientName]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function reset() {
    setClientNumber('');
    setPatientNumber('');
    setClientName('');
    setOpen(false);
  }

  function pickClient(c) {
    reset();
    onPickClient(c);
  }

  function pickPatient(p) {
    reset();
    onPickPatient(p);
  }

  const hasResults = results.clients.length > 0 || results.patients.length > 0;

  return (
    <div className="search-box" style={{ flex: '1 1 100%', minWidth: 0 }} ref={boxRef}>
      <div className="field-search-row">
        <input
          placeholder="Client #"
          inputMode="numeric"
          value={clientNumber}
          onChange={(e) => setClientNumber(e.target.value)}
          onFocus={() => hasTerm && setOpen(true)}
        />
        <input
          placeholder="Patient #"
          inputMode="numeric"
          value={patientNumber}
          onChange={(e) => setPatientNumber(e.target.value)}
          onFocus={() => hasTerm && setOpen(true)}
        />
        <input
          placeholder="Client name"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          onFocus={() => hasTerm && setOpen(true)}
        />
      </div>
      {open && (
        <div className="search-dropdown">
          {loading && <p className="search-empty">Searching...</p>}
          {!loading && !hasResults && <p className="search-empty">No matches.</p>}

          {!loading && results.clients.length > 0 && (
            <>
              <div className="search-group-label">Clients</div>
              {results.clients.map((c) => (
                <button key={c.id} type="button" className="search-result" onClick={() => pickClient(c)}>
                  <strong>{c.full_name}</strong>
                  <span>
                    Client #{c.client_number} · {c.phone || 'no phone'}
                  </span>
                </button>
              ))}
            </>
          )}

          {!loading && results.patients.length > 0 && (
            <>
              <div className="search-group-label">Patients</div>
              {results.patients.map((p) => (
                <button key={p.id} type="button" className="search-result" onClick={() => pickPatient(p)}>
                  <strong>{p.name}</strong>
                  <span>
                    #{p.patient_number} · {p.species} · Owner: {p.clients?.full_name || '—'}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
