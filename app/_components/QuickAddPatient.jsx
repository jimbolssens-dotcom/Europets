// app/_components/QuickAddPatient.jsx
// Minimal "add a patient" form for the Home dashboard's quick-add panel —
// just what POST /api/patients actually requires (owner, name, species,
// sex), unlike the full Patients page form (breed/color/weight/microchip
// fields). Reach for the Patients page itself for that fuller record.

'use client';

import { useState } from 'react';
import SingleTypeSearch from './SingleTypeSearch';
import SpeciesField from './SpeciesField';

export default function QuickAddPatient() {
  const [owner, setOwner] = useState(null);
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('');
  const [sex, setSex] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!owner) {
      setError('Search for and pick the owner first');
      return;
    }
    setSubmitting(true);
    setError(null);
    setCreated(null);

    const res = await fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: owner.id, name, species, sex }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error || 'Failed to add patient');
      return;
    }
    setCreated(data);
    setOwner(null);
    setName('');
    setSpecies('');
    setSex('');
  }

  return (
    <form className="card quick-add-form" onSubmit={handleSubmit}>
      <h3>Add Patient</h3>
      {error && <p className="error">{error}</p>}
      {created && (
        <p className="quick-add-success">
          Added <a href={`/patients/${created.id}`}>{created.name}</a>.
        </p>
      )}
      {owner ? (
        <p>
          Owner: <strong>{owner.full_name}</strong>{' '}
          <button type="button" onClick={() => setOwner(null)}>
            Change
          </button>
        </p>
      ) : (
        <SingleTypeSearch type="client" placeholder="Search for the owner..." onPick={setOwner} />
      )}
      <input placeholder="Patient name" required value={name} onChange={(e) => setName(e.target.value)} />
      <SpeciesField value={species} onChange={setSpecies} />
      <select value={sex} onChange={(e) => setSex(e.target.value)} required>
        <option value="" disabled>
          Sex...
        </option>
        <option value="male">Male</option>
        <option value="female">Female</option>
        <option value="male_castrated">Male (Castrated)</option>
        <option value="female_spayed">Female (Spayed)</option>
        <option value="unknown">Unknown</option>
      </select>
      <button type="submit" disabled={submitting}>
        {submitting ? 'Adding...' : 'Add Patient'}
      </button>
    </form>
  );
}
