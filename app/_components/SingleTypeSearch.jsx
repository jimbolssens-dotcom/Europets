// app/_components/SingleTypeSearch.jsx
// One search box scoped to just clients OR just patients (not both) —
// same live-dropdown-as-you-type behavior as the combined SearchBox/
// ClientOrPatientSearch, but for a caller that wants two independent
// fields side by side (see the Home dashboard's Find panel) rather than
// one combined box. Hands the picked result back via onPick; the caller
// decides what picking means (navigate, fill in a form field, ...).

'use client';

import { useEffect, useRef, useState } from 'react';

export default function SingleTypeSearch({ type, placeholder, onPick }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      const requestId = ++requestIdRef.current;
      fetch(`/api/search?q=${encodeURIComponent(q)}&type=${type}`)
        .then((res) => res.json())
        .then((data) => {
          // A slower, older search can resolve after a newer, more specific
          // one — only apply the most recently issued request's results.
          if (requestId !== requestIdRef.current) return;
          setResults((type === 'client' ? data.clients : data.patients) || []);
          setOpen(true);
          setLoading(false);
        });
    }, 300);
    return () => clearTimeout(handle);
  }, [q, type]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function pick(result) {
    setOpen(false);
    setQ('');
    onPick(result);
  }

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
          {!loading && results.length === 0 && <p className="search-empty">No matches.</p>}
          {!loading &&
            results.map((r) =>
              type === 'client' ? (
                <button key={r.id} type="button" className="search-result" onClick={() => pick(r)}>
                  <strong>{r.full_name}</strong>
                  <span>{r.phone}</span>
                </button>
              ) : (
                <button key={r.id} type="button" className="search-result" onClick={() => pick(r)}>
                  <strong>{r.name}</strong>
                  <span>
                    {r.species}
                    {r.breed ? ` · ${r.breed}` : ''} · Owner: {r.clients?.full_name || '—'}
                  </span>
                </button>
              )
            )}
        </div>
      )}
    </div>
  );
}
