// app/_components/PetPhotoButton.jsx
// The pet's round picture (or its cat/dog icon) with a small camera badge.
// Tap it for two choices: 📷 Take photo (opens the camera straight away,
// capture="environment") or 🖼️ Choose photo (the library); a plain file
// picker only offered the gallery on the clinic's phones (Jim, 18 Nov).
// Shrunk before upload (lib/profilePhoto.js, via uploadPatientProfilePhoto).
// Used in the desktop patient header (PatientHeader.jsx) and on the phone
// pages for a consult, a hospital stay and a day procedure.

'use client';

import { useEffect, useRef, useState } from 'react';
import { speciesEmoji } from '@/lib/petAge';
import { uploadPatientProfilePhoto } from '@/lib/attachments';

export default function PetPhotoButton({ patient }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [url, setUrl] = useState(null);
  const [menu, setMenu] = useState(false);
  const wrap = useRef(null);
  const camera = useRef(null);
  const library = useRef(null);

  // Tapping anywhere else closes the menu.
  useEffect(() => {
    if (!menu) return;
    const close = (e) => wrap.current && !wrap.current.contains(e.target) && setMenu(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);

  if (!patient?.id) return null;
  const shown = url || patient.profile_photo_url;

  async function change(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    setMenu(false);
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
    <span className="pet-photo-wrap" ref={wrap}>
      <button
        type="button"
        className={`patient-header-photo pet-photo-button${busy ? ' busy' : ''}`}
        onClick={() => !busy && setMenu((m) => !m)}
        title={shown ? 'Change the photo' : 'Add a photo'}
        aria-label={shown ? 'Change the photo' : 'Add a photo'}
        aria-expanded={menu}
      >
        {shown ? (
          <img className="patient-header-avatar" src={shown} alt="" />
        ) : (
          <span className="patient-header-avatar patient-header-avatar-emoji">{speciesEmoji(patient.species)}</span>
        )}
        <span className="patient-header-photo-badge" aria-hidden="true">{busy ? '…' : '📷'}</span>
      </button>
      {menu && (
        <span className="pet-photo-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => camera.current?.click()}>📷 Take photo</button>
          <button type="button" role="menuitem" onClick={() => library.current?.click()}>🖼️ Choose photo</button>
        </span>
      )}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={change} />
      <input ref={library} type="file" accept="image/*" hidden onChange={change} />
      {error && <span className="error patient-header-photo-error">{error}</span>}
    </span>
  );
}
