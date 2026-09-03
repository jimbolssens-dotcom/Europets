// app/_components/SearchSelect.jsx
// Live-filtering "type to search" replacement for a plain <select> — used
// anywhere the app picks a client or patient (or any other named record) by
// name: type part of the name and matching results appear live below, click
// one to select it. Filters the given `items` array client-side (the pages
// using this already load the full clients/patients list into memory for
// their old <select>, so no new fetching is introduced).

'use client';

import { useEffect, useRef, useState } from 'react';

export default function SearchSelect({
  items,
  value,
  onChange,
  getLabel,
  getSubLabel,
  placeholder = 'Type to search...',
  disabled = false,
  emptyMessage = 'No matches.',
}) {
  const selected = items.find((i) => i.id === value) || null;
  const [query, setQuery] = useState(selected ? getLabel(selected) : '');
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  // Keep the displayed text in sync when the selection changes from
  // outside — the parent resetting the form after submit, or clearing this
  // field because a preceding one (e.g. owner) changed.
  useEffect(() => {
    const current = items.find((i) => i.id === value) || null;
    setQuery(current ? getLabel(current) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setOpen(false);
        // Typed text left without picking a match reverts to the last
        // valid selection (or clears) instead of leaving stray free text.
        const current = items.find((i) => i.id === value) || null;
        setQuery(current ? getLabel(current) : '');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, items]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter((i) => {
        const label = getLabel(i).toLowerCase();
        const sub = getSubLabel ? String(getSubLabel(i) || '').toLowerCase() : '';
        return label.includes(q) || sub.includes(q);
      })
    : items;

  function pick(item) {
    onChange(item.id);
    setQuery(getLabel(item));
    setOpen(false);
  }

  function handleInputChange(e) {
    const next = e.target.value;
    setQuery(next);
    setOpen(true);
    if (value) onChange('');
  }

  return (
    <div className="search-select" ref={boxRef}>
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onChange={handleInputChange}
        onFocus={() => !disabled && setOpen(true)}
        autoComplete="off"
      />
      {open && !disabled && (
        <div className="search-dropdown">
          {filtered.length === 0 && <p className="search-empty">{emptyMessage}</p>}
          {filtered.slice(0, 50).map((item) => (
            <button key={item.id} type="button" className="search-result" onClick={() => pick(item)}>
              <strong>{getLabel(item)}</strong>
              {getSubLabel && <span>{getSubLabel(item)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
