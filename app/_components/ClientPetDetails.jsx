// app/_components/ClientPetDetails.jsx
// The owner's own microchip number and date of birth for a pet, in the
// client app (Jim, 10 Nov): two small chips under the pet's name; tapping
// one opens a short form. Saved with PATCH /api/patients/:id, checked by
// lib/ownerPetDetails.js (a birth date from the owner is no longer marked
// estimated).

'use client';

import { useState } from 'react';
import { birthDateError, cleanMicrochip, microchipError } from '@/lib/ownerPetDetails';

function longDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default function ClientPetDetails({ pet, onSaved }) {
  const [editing, setEditing] = useState(null); // 'chip' | 'dob' | null
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function open(which) {
    setError(null);
    setEditing(which);
    setValue(which === 'chip' ? pet.microchip_number || '' : pet.date_of_birth || '');
  }

  async function save(e) {
    e.preventDefault();
    const field = editing === 'chip' ? 'microchip_number' : 'date_of_birth';
    const problem = editing === 'chip' ? microchipError(value) : birthDateError(value);
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/patients/${pet.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: editing === 'chip' ? cleanMicrochip(value) : value || null }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Could not save');
      setEditing(null);
      // Only what was just saved, so the other chip keeps what it shows.
      onSaved?.(field === 'date_of_birth' ? { date_of_birth: out.date_of_birth, date_of_birth_estimated: out.date_of_birth_estimated } : { microchip_number: out.microchip_number });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cpd">
      <div className="cpd-chips">
        <button type="button" className={`cpd-chip${pet.microchip_number ? '' : ' cpd-chip-add'}`} onClick={() => open('chip')}>
          🔖 {pet.microchip_number ? <>Chip {pet.microchip_number}</> : '+ Add microchip'}
        </button>
        <button type="button" className={`cpd-chip${pet.date_of_birth ? '' : ' cpd-chip-add'}`} onClick={() => open('dob')}>
          🎂 {pet.date_of_birth ? <>Born {longDate(pet.date_of_birth)}{pet.date_of_birth_estimated ? ' (estimated)' : ''}</> : '+ Add date of birth'}
        </button>
      </div>
      {editing && (
        <form className="cpd-form" onSubmit={save}>
          <label>
            {editing === 'chip' ? 'Microchip number' : 'Date of birth'}
            {editing === 'chip' ? (
              <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="15 numbers, e.g. 784098100123456" maxLength={24} autoFocus />
            ) : (
              <input type="date" value={value} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setValue(e.target.value)} autoFocus />
            )}
          </label>
          {editing === 'dob' && pet.date_of_birth_estimated && <p className="cpd-hint">The clinic estimated this from the age. Change it if you know the real date.</p>}
          {error && <p className="client-app-login-error">{error}</p>}
          <div className="cpd-actions">
            <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" className="cpd-cancel" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
