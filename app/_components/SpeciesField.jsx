// app/_components/SpeciesField.jsx
// A Cat/Dog dropdown with a manual-entry escape hatch — most patients are
// cats or dogs, but the clinic sees the occasional rabbit, bird, etc., so
// picking "Other..." reveals a free-text input instead of forcing a guess
// into one of the two options.

'use client';

import { useState } from 'react';

const KNOWN = ['cat', 'dog'];

export default function SpeciesField({ value, onChange, required = true }) {
  const [otherMode, setOtherMode] = useState(value !== '' && !KNOWN.includes(value));

  function handleSelect(e) {
    const v = e.target.value;
    if (v === 'other') {
      setOtherMode(true);
      onChange('');
    } else {
      setOtherMode(false);
      onChange(v);
    }
  }

  return (
    <>
      <select value={otherMode ? 'other' : value} onChange={handleSelect} required={required}>
        <option value="">Species...</option>
        <option value="cat">Cat</option>
        <option value="dog">Dog</option>
        <option value="other">Other...</option>
      </select>
      {otherMode && (
        <input
          placeholder="Species (e.g. rabbit, bird)"
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </>
  );
}
