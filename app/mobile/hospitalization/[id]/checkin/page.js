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

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CHECKIN_CATEGORIES } from '@/lib/hospitalizationCheckin';
import { MOBILE_STAFF_STORAGE_KEY } from '@/app/_components/useMobileStaff';
import MobileCleanerTabs from '@/app/_components/MobileCleanerTabs';

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
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

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

  const hasAnySelection = Object.values(selection).some(Boolean);

  async function saveCheckin() {
    setSubmitting(true);
    await fetch(`/api/hospitalizations/${id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_id: authorId || null,
        note_date: todayISODate(),
        ...selection,
      }),
    });
    setSubmitting(false);
    setSaved(true);
    setSelection(emptySelection);
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
            </div>
          ))}

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
