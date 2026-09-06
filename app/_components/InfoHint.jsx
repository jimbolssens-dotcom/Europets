// app/_components/InfoHint.jsx
// Wraps a paragraph of explanatory/help text (the kind that used to sit
// permanently under a button or form, cluttering the page) behind a small
// eye-icon toggle — collapsed by default, expands in place when clicked.
// The text itself keeps the existing .visit-meta look; this just adds the
// show/hide affordance around it.

'use client';

import { useState } from 'react';

export default function InfoHint({ children }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="info-hint">
      <button
        type="button"
        className="info-hint-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Hide info' : 'Show info'}
        title={open ? 'Hide info' : 'Show info'}
      >
        👁️
      </button>
      {open && <p className="visit-meta info-hint-text">{children}</p>}
    </span>
  );
}
