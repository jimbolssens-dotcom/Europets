// app/_components/SearchBox.jsx
// Global "find a client or patient" search in the top nav — live dropdown
// as you type (name, phone, breed, microchip), or press Enter / "View all"
// for the full results page.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SearchBox() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState({ clients: [], patients: [] });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);
  const router = useRouter();

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

  function pick(url) {
    setOpen(false);
    setQ('');
    router.push(url);
  }

  function goToResults(e) {
    e.preventDefault();
    if (!q.trim()) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  const hasResults = results.clients.length > 0 || results.patients.length > 0;

  return (
    <div className="search-box" ref={boxRef}>
      <form onSubmit={goToResults}>
        <input
          type="search"
          placeholder="Search clients or patients..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => q.trim() && setOpen(true)}
        />
      </form>
      {open && (
        <div className="search-dropdown">
          {loading && <p className="search-empty">Searching...</p>}
          {!loading && !hasResults && <p className="search-empty">No matches.</p>}

          {!loading && results.clients.length > 0 && (
            <>
              <div className="search-group-label">Clients</div>
              {results.clients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="search-result"
                  onClick={() => pick(`/clients/${c.id}`)}
                >
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
                <button
                  key={p.id}
                  type="button"
                  className="search-result"
                  onClick={() => pick(`/patients/${p.id}`)}
                >
                  <strong>{p.name}</strong>
                  <span>
                    {p.species}
                    {p.breed ? ` · ${p.breed}` : ''} · Owner: {p.clients?.full_name || '—'}
                    {p.microchip_number ? ` · Chip: ${p.microchip_number}` : ''}
                  </span>
                </button>
              ))}
            </>
          )}

          {!loading && hasResults && (
            <button
              type="button"
              className="search-view-all"
              onClick={() => pick(`/search?q=${encodeURIComponent(q)}`)}
            >
              View all results for &quot;{q}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
