// app/mobile/hospitalization/[id]/checkin/page.js
// "Quick Check-In" — the simplified cleaner version of recording a
// hospitalization observation. No audio recording, no medications, no
// free-text: just tap the tile that matches what you saw for each
// category (see lib/hospitalizationCheckin.js for the full option list).
// Tapping a selected tile again deselects it. Saves as a normal
// hospitalization_notes row via the same POST route the full worksheet
// form uses — it shows up the same way in the staff worksheet and the
// client portal (see app/_components/CheckinSummary.jsx), and clears any
// pending "Request an Update" flag exactly like any other entry does.
//
// Reached only from the cage layout when the current phone is a cleaner
// (see app/mobile/hospitalization/page.js) — anyone else's tap on an
// occupied cage still goes to the full worksheet page.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CHECKIN_CATEGORIES } from '@/lib/hospitalizationCheckin';
import { MOBILE_STAFF_STORAGE_KEY } from '@/app/_components/useMobileStaff';
import MobileCleanerTabs from '@/app/_components/MobileCleanerTabs';
import { uploadAttachment } from '@/lib/attachments';

const emptySelection = Object.fromEntries(CHECKIN_CATEGORIES.map((c) => [c.key, '']));

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
  const [stagedPhotos, setStagedPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
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
    const res = await fetch(`/api/hospitalizations/${id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_id: authorId || null,
        note_date: todayISODate(),
        temperature_c: temperatureC !== '' ? temperatureC : undefined,
        ...selection,
      }),
    });
    const data = await res.json().catch(() => null);

    if (res.ok && data?.id && stagedPhotos.length > 0) {
      await Promise.all(
        stagedPhotos.map(({ file }) =>
          uploadAttachment({
            entityType: 'hospitalization_note',
            entityId: data.id,
            file,
            uploadedBy: authorId || null,
          }).catch(() => {})
        )
      );
      stagedPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    }

    setSubmitting(false);
    setSaved(true);
    setSelection(emptySelection);
    setTemperatureC('');
    setStagedPhotos([]);
  }

  return (
    <div className="mobile-page">
      <MobileCleanerTabs active="hospital" />

      {admission && (
        <>
          <h1>
            {admission.cages?.name || 'No cage'} — {admission.patients?.name}
          </h1>
          <p className="mobile-subtitle">{admission.clients?.full_name}</p>

          {saved && <p className="mobile-saved">✅ Check-in logged.</p>}

          {CHECKIN_CATEGORIES.map((category) => (
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
              {category.key === 'temperature_feel' && (
                <label className="checkin-number-field">
                  Actual reading (optional)
                  <input
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    placeholder="°C"
                    value={temperatureC}
                    onChange={(e) => {
                      setSaved(false);
                      setTemperatureC(e.target.value);
                    }}
                  />
                </label>
              )}
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
                📷 Take Photo
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()}>
                📎 Add File
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
            {submitting ? 'Saving...' : '✅ Save Check-In'}
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
