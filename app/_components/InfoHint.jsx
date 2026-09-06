// app/_components/InfoHint.jsx
// Wraps a paragraph of explanatory/help text (the kind that used to sit
// permanently under a button or form, cluttering the page) behind the
// standard black info-circle icon — collapsed by default, floats over the
// page as a popover when clicked instead of pushing the rest of the
// layout down. Closes on an outside click, another toggle click, or
// Escape.

'use client';

import { useEffect, useRef, useState } from 'react';

export default function InfoHint({ children }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <span className="info-hint" ref={wrapRef}>
      <button
        type="button"
        className="info-hint-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Hide info' : 'Show info'}
        title={open ? 'Hide info' : 'Show info'}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
        </svg>
      </button>
      {open && <p className="visit-meta info-hint-popover">{children}</p>}
    </span>
  );
}
