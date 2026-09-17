// app/mobile/hospitalization/[id]/checkin/page.js
// "Quick Check-In" — the simplified cleaner version of recording a
// hospitalization observation. No audio recording, no medications, no
// free-text: just tap the tile that matches what you saw for each
// category (see lib/hospitalizationCheckin.js for the full option list).
// Tapping a selected tile again deselects it. Saves as a normal
// hospitalization_notes row via the same POST route the full worksheet
// form uses — it shows up the same way in the staff worksheet and the
// client portal (see lib/hospitalizationCheckin.js: buildEmpathicCheckinText),
// and clears any pending "Request an Update" flag exactly like any other
// entry does.
//
// Reached only from the cage layout when the current phone is a cleaner
// (see app/mobile/hospitalization/page.js) — anyone else's tap on an
// occupied cage still goes to the full worksheet page.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CHECKIN_CATEGORIES } from '@/lib/hospitalizationCheckin';
import { MOBILE_STAFF_STORAGE_KEY } from '@/app/_components/useMobileStaff';
import MobileHomeButton from '@/app/_components/MobileHomeButton';
import TempDial from '@/app/_components/TempDial';
import { uploadAttachment } from '@/lib/attachments';

// The dial gives an exact reading, which buildEmpathicCheckinText already
// prefers over the qualitative feel whenever both are present — but
// temperature_feel is still derived and sent alongside it so nothing that
// reads that field (hasCheckinData, the staff worksheet's icon chips, older
// entries) needs to change just because this page stopped offering it as a
// direct tap.
function feelFromTemp(tempC) {
  if (tempC === '' || tempC == null) return '';
  const n = Number(tempC);
  if (n > 39) return 'warm';
  if (n < 37.5) return 'cold';
  return 'normal';
}

const TEMPERATURE_CATEGORY_KEY = 'temperature_feel';
const emptySelection = Object.fromEntries(
  CHECKIN_CATEGORIES.filter((c) => c.key !== TEMPERATURE_CATEGORY_KEY).map((c) => [c.key, ''])
);

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default function MobileHospitalizationCheckinPage() {
  const { id } = useParams();
  const router = useRouter();
  const [admission, setAdmission] = useState(null);
  const [authorId, setAuthorId] = useState('');
  const [selection, setSelection] = useState(emptySelection);
  const [temperatureC, setTemperatureC] = useState('');
  const [dialResetKey, setDialResetKey] = useState(0);
  const [stagedPhotos, setStagedPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetch(`/api/hospitalizations/${id}`)
      .then((res) => res.json())
      .then(setAdmission);
    setAuthorId(localStorage.getItem(MOBILE_STAFF_STORAGE_KEY) || '');
  }, [id]);

  function pickTile(categoryKey, value) {
    setSaved(false);
    setSelection((prev) => ({ ...prev, [categoryKey]: prev[categoryKey] === value ? '' : value }));
  }

  function addStagedPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    setSaved(false);
    setStagedPhotos((prev) => [...prev, { file, previewUrl: URL.createObjectURL(file) }]);
    e.target.value = '';
  }

  function removeStagedPhoto(index) {
    setStagedPhotos((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  const hasAnySelection = Object.values(selection).some(Boolean) || temperatureC !== '' || stagedPhotos.length > 0;

  async function saveCheckin() {
    setSubmitting(true);
    setUploadError(null);
    const res = await fetch(`/api/hospitalizations/${id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_id: authorId || null,
        note_date: todayISODate(),
        temperature_c: temperatureC !== '' ? temperatureC : undefined,
        temperature_feel: feelFromTemp(temperatureC),
        ...selection,
      }),
    });
    const data = await res.json().catch(() => null);

    let failedPhotos = [];
    if (res.ok && data?.id && stagedPhotos.length > 0) {
      // allSettled, not all — a failed upload must not be swallowed
      // (silently losing a photo staff believe they already attached is
      // worse than a visible error). Failed ones stay staged so tapping
      // Save Check-In again retries them.
      const results = await Promise.allSettled(
        stagedPhotos.map(({ file }) =>
          uploadAttachment({
            entityType: 'hospitalization_note',
            entityId: data.id,
            file,
            uploadedBy: authorId || null,
          })
        )
      );
      failedPhotos = stagedPhotos.filter((_, i) => results[i].status === 'rejected');
      stagedPhotos
        .filter((_, i) => results[i].status === 'fulfilled')
        .forEach((p) => URL.revokeObjectURL(p.previewUrl));
      if (failedPhotos.length > 0) {
        setUploadError(
          `Check-in logged, but ${failedPhotos.length} photo${
            failedPhotos.length === 1 ? '' : 's'
          } failed to upload — tap Save Check-In again to retry.`
        );
      }
    }

    setSubmitting(false);
    setSaved(true);
    setSelection(emptySelection);
    setTemperatureC('');
    setDialResetKey((k) => k + 1);
    setStagedPhotos(failedPhotos);
  }

  return (
    <div className="mobile-page">
      <MobileHomeButton />

      {admission && (
        <>
          <h1>
            {admission.cages?.name || 'No cage'} — {admission.patients?.name}
            {admission.patients?.patient_number ? ` (Patient #${admission.patients.patient_number})` : ''}
          </h1>
          <p className="mobile-subtitle">
            {admission.clients?.full_name}
            {admission.clients?.client_number ? ` (Client #${admission.clients.client_number})` : ''}
          </p>

          {saved && <p className="mobile-saved">✅ Check-in logged.</p>}
          {uploadError && <p className="error">{uploadError}</p>}

          <div className="checkin-section">
            <h2 className="checkin-section-label">
              Temperature
              {temperatureC !== '' && <span className="checkin-temp-badge">{Number(temperatureC).toFixed(1)}°C</span>}
            </h2>
            <p className="checkin-temp-hint">Press and hold, then drag up (warmer) or down (cooler) — optional.</p>
            <TempDial
              key={dialResetKey}
              value={temperatureC !== '' ? Number(temperatureC) : null}
              onChange={(v) => {
                setSaved(false);
                setTemperatureC(v.toFixed(1));
              }}
            />
            {temperatureC !== '' && (
              <button
                type="button"
                className="checkin-temp-clear"
                onClick={() => {
                  setSaved(false);
                  setTemperatureC('');
                  setDialResetKey((k) => k + 1);
                }}
              >
                ✕ Clear reading
              </button>
            )}
          </div>

          {CHECKIN_CATEGORIES.filter((c) => c.key !== TEMPERATURE_CATEGORY_KEY).map((category) => (
            <div key={category.key} className="checkin-section">
              <h2 className="checkin-section-label">{category.label}</h2>
              <div className="checkin-tile-grid">
                {category.options.map((option) => {
                  const isSelected = selection[category.key] === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`checkin-tile${isSelected ? ' checkin-tile-selected' : ''}`}
                      onClick={() => pickTile(category.key, option.value)}
                    >
                      <span className="checkin-tile-icon">{option.icon}</span>
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="checkin-section">
            <h2 className="checkin-section-label">Photo</h2>
            {stagedPhotos.length > 0 && (
              <ul className="attachment-list">
                {stagedPhotos.map((p, i) => (
                  <li key={i}>
                    <img className="attachment-thumb" src={p.previewUrl} alt="staged photo" />
                    <button type="button" onClick={() => removeStagedPhoto(i)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="attachment-actions">
              <button type="button" onClick={() => cameraInputRef.current?.click()}>
                📷 Photo
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()}>
                📎 File
              </button>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={addStagedPhoto}
              hidden
            />
            <input ref={fileInputRef} type="file" accept="image/*" onChange={addStagedPhoto} hidden />
          </div>

          <button type="button" onClick={saveCheckin} disabled={submitting || !hasAnySelection}>
            {submitting ? 'Saving...' : '✅ Save'}
          </button>

          <button
            type="button"
            className="mobile-secondary-action"
            onClick={() => router.push('/mobile/hospitalization')}
          >
            Done
          </button>
        </>
      )}
    </div>
  );
}
