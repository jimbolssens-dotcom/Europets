// app/_components/PetAttributeField.jsx
// A dropdown of common options for whichever species is selected, with a
// manual-entry "Other..." escape hatch — same pattern as SpeciesField,
// used for both breed and color (see lib/petAttributes.js for the actual
// cat/dog option lists). Species other than cat/dog (rabbit, bird, ...)
// have no list to offer, so this just falls back to a plain text input —
// same as breed already worked before this existed.

'use client';

import { useEffect, useState } from 'react';

const OTHER = '__other__';

export default function PetAttributeField({ species, value, onChange, catOptions, dogOptions, placeholder }) {
  const options = species === 'cat' ? catOptions : species === 'dog' ? dogOptions : null;
  const [otherMode, setOtherMode] = useState(Boolean(options && value && !options.includes(value)));

  // Re-check when the species (and so the option list) changes — a value
  // that doesn't fit the new list falls back to free text instead of
  // silently being discarded.
  useEffect(() => {
    if (!options) return;
    setOtherMode(Boolean(value) && !options.includes(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [species]);

  if (!options) {
    return <input placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
  }

  function handleSelect(e) {
    const v = e.target.value;
    if (v === OTHER) {
      setOtherMode(true);
      onChange('');
    } else {
      setOtherMode(false);
      onChange(v);
    }
  }

  return (
    <>
      <select value={otherMode ? OTHER : value} onChange={handleSelect}>
        <option value="">{placeholder}...</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={OTHER}>Other...</option>
      </select>
      {otherMode && (
        <input
          placeholder={`${placeholder} (specify)`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </>
  );
}
