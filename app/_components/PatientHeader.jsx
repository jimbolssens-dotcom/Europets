// app/_components/PatientHeader.jsx
// The top of a consult, day procedure or hospitalization: the pet's name
// (big, and the link to the patient record), the patient number, the age
// as a bold pill, species/breed, sex, weight and any other chips, and the
// case status in plain words. `children` is the second, quieter row
// (owner, room or cage, vet, times...).
//
// When the date of birth is missing, the age pill becomes an amber
// "Age? Add" and, with `promptAge` (a consult that's just been opened),
// a small "How old is ...?" box opens on its own: a date of birth, or
// "about N years M months" saved as an estimated date of birth (migration
// 178). Never blocking: "Not now" hides it. `ageRequest` lets the page
// open the same box itself (e.g. on Complete Consult), with its own
// message and skip button.

'use client';

import { useEffect, useState } from 'react';
import { petAgeLabel, estimatedDateOfBirth, sexLabel, speciesEmoji } from '@/lib/petAge';

export default function PatientHeader({
  patient,
  status, // { label, tone: 'progress' | 'admitted' | 'dayproc' | 'done' }
  chips = null,
  promptAge = false,
  ageRequest = null, // { message, skipLabel, onSkip } to open the age box from the page
  onPatientUpdated,
  actions = null, // buttons for the end of the second row (e.g. Doctor Checkup, Messages)
  children,
}) {
  const p = patient || {};
  const age = petAgeLabel(p.date_of_birth, p.date_of_birth_estimated);
  const [ageOpen, setAgeOpen] = useState(false);
  const [dob, setDob] = useState('');
  const [years, setYears] = useState('');
  const [months, setMonths] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // "Not now" on the automatic box is remembered for this browser session,
  // so it doesn't reappear on every reload of the same consult.
  const skipKey = `age-prompt-skipped:${p.id}`;
  useEffect(() => {
    if (!promptAge || !p.id || p.date_of_birth) return;
    let skipped = false;
    try { skipped = sessionStorage.getItem(skipKey) === '1'; } catch {}
    if (!skipped) setAgeOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptAge, p.id, p.date_of_birth]);
  useEffect(() => {
    if (ageRequest) setAgeOpen(true);
  }, [ageRequest]);

  async function saveAge(e) {
    e.preventDefault();
    const exact = dob || null;
    const estimate = exact ? null : estimatedDateOfBirth(years, months);
    if (!exact && !estimate) {
      setError('Enter a date of birth, or roughly how old.');
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/patients/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date_of_birth: exact || estimate, date_of_birth_estimated: !exact }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error || 'Could not save the age.');
      return;
    }
    setAgeOpen(false);
    if (onPatientUpdated) onPatientUpdated(data);
  }

  const species = [p.species ? `${speciesEmoji(p.species)} ${p.species[0].toUpperCase()}${p.species.slice(1)}` : null, p.breed]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="patient-header">
      <div className="patient-header-row1">
        {p.profile_photo_url ? (
          <img className="patient-header-avatar" src={p.profile_photo_url} alt="" />
        ) : (
          <span className="patient-header-avatar patient-header-avatar-emoji">{speciesEmoji(p.species)}</span>
        )}
        <h1>
          <a href={`/patients/${p.id}`} title="Open the patient record">{p.name || 'Patient'}</a>
        </h1>
        {p.patient_number && <span className="patient-header-number">#{p.patient_number}</span>}
        {age ? (
          <span className="patient-chip patient-chip-age" title={p.date_of_birth_estimated ? 'Estimated age' : `Born ${p.date_of_birth}`}>
            {age}
          </span>
        ) : (
          <button type="button" className="patient-chip patient-chip-age-missing" onClick={() => setAgeOpen((v) => !v)}>
            ⚠️ Age? Add
          </button>
        )}
        {species && <span className="patient-chip">{species}</span>}
        {sexLabel(p.sex) && <span className="patient-chip">{sexLabel(p.sex)}</span>}
        {chips}
        {status && <span className={`patient-status patient-status-${status.tone || 'progress'}`}>{status.label}</span>}
      </div>

      {ageOpen && (
        <form className="patient-age-box" onSubmit={saveAge}>
          <strong>{ageRequest?.message || `How old is ${p.name || 'this pet'}?`}</strong>
          <label>
            Date of birth <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </label>
          <span>
            or about{' '}
            <input className="patient-age-num" type="number" min="0" max="40" value={years} onChange={(e) => setYears(e.target.value)} disabled={!!dob} /> years{' '}
            <input className="patient-age-num" type="number" min="0" max="11" value={months} onChange={(e) => setMonths(e.target.value)} disabled={!!dob} /> months
          </span>
          <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save age'}</button>
          <button
            type="button"
            className="patient-age-skip"
            onClick={() => {
              setAgeOpen(false);
              if (ageRequest?.onSkip) ageRequest.onSkip();
              else {
                try { sessionStorage.setItem(skipKey, '1'); } catch {}
              }
            }}
          >
            {ageRequest?.skipLabel || 'Not now'}
          </button>
          {error && <span className="error">{error}</span>}
        </form>
      )}

      {(children || actions) && (
        <div className="patient-header-row2">
          {children}
          {actions && <div className="patient-header-actions">{actions}</div>}
        </div>
      )}
    </div>
  );
}

// One "Label value" item in the second row.
export function PatientMeta({ label, children }) {
  return (
    <span className="patient-meta">
      <span className="patient-meta-label">{label}</span> {children}
    </span>
  );
}
