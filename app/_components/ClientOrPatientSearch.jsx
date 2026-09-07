// app/_components/ClientOrPatientSearch.jsx
// One search box that looks up clients and patients together, like the
// global nav search (SearchBox) — but instead of navigating to a page,
// it hands the pick back to the caller. Picking a patient result selects
// its owner too in one step; picking a client result selects just the
// owner, leaving the caller to narrow down to a specific pet (e.g. via
// SearchSelect over that client's patients).

'use client';

import { useEffect, useRef, useState } from 'react';

export default function ClientOrPatientSearch({ onPickClient, onPickPatient, placeholder = 'Search clients or patients...' }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState({ clients: [], patients: [] });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!q.trim()) {
      setResults({ clients: [], patients: [] });
      setOpen(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((data) => {
          setResults({ clients: data.clients || [], patients: data.patients || [] });
          setOpen(true);
          setLoading(false);
        });
    }, 300);
    return () => clearTimeout(handle);
  }, [q]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function pickClient(c) {
    setOpen(false);
    setQ('');
    onPickClient(c);
  }

  function pickPatient(p) {
    setOpen(false);
    setQ('');
    onPickPatient(p);
  }

  const hasResults = results.clients.length > 0 || results.patients.length > 0;

  return (
    <div className="search-box" ref={boxRef}>
      <input
        type="search"
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => q.trim() && setOpen(true)}
      />
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
                  <span>{c.phone}</span>
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
                    {p.species} · Owner: {p.clients?.full_name || '—'}
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
