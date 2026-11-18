// app/_components/PetPhotoButton.jsx
// The pet's round picture (or its cat/dog icon) with a small camera badge:
// tap it to add or change the profile photo from the phone's camera or
// library. Shrunk before upload (lib/profilePhoto.js, via
// uploadPatientProfilePhoto). Used on the phone pages for a consult, a
// hospital stay and a day procedure (Jim, 18 Nov); the desktop patient
// header has the same (PatientHeader.jsx).

'use client';

import { useState } from 'react';
import { speciesEmoji } from '@/lib/petAge';
import { uploadPatientProfilePhoto } from '@/lib/attachments';

export default function PetPhotoButton({ patient }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [url, setUrl] = useState(null);
  if (!patient?.id) return null;
  const shown = url || patient.profile_photo_url;

  async function change(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await uploadPatientProfilePhoto(patient.id, file);
      setUrl(updated.profile_photo_url);
    } catch (err) {
      setError(err.message || 'Could not save the photo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label className={`patient-header-photo pet-photo-button${busy ? ' busy' : ''}`} title={shown ? 'Change the photo' : 'Add a photo'}>
        {shown ? (
          <img className="patient-header-avatar" src={shown} alt="" />
        ) : (
          <span className="patient-header-avatar patient-header-avatar-emoji">{speciesEmoji(patient.species)}</span>
        )}
        <span className="patient-header-photo-badge" aria-hidden="true">{busy ? '…' : '📷'}</span>
        <input type="file" accept="image/*" hidden onChange={change} disabled={busy} aria-label={shown ? 'Change the photo' : 'Add a photo'} />
      </label>
      {error && <span className="error patient-header-photo-error">{error}</span>}
    </>
  );
}
