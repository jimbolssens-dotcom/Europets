// app/client-app/pets/page.js
// The logged-in client's own pets — see useClientAppSession for what
// "logged in" means here. Tapping a pet opens its full history
// (app/client-app/pets/[id]/page.js); a pet currently admitted also gets
// its own separate link straight to the existing public portal status
// page.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClientAppSession } from '@/app/_components/useClientAppSession';
import HexIcon from '@/app/_components/HexIcon';
import { catteryToday } from '@/lib/cattery';

// Next.js App Router doesn't reliably restore scroll position on
// router.back() the way plain browser back-navigation does (a known App
// Router gap, not something fixable from the detail page's own "back"
// link) — this page saves/restores its own scroll position instead,
// independent of how staff navigated back to it. Session-scoped: a stale
// position from a much earlier visit shouldn't reapply to a fresh tab.
const SCROLL_STORAGE_KEY = 'client-app-pets-scroll';

function ageFromDob(dob) {
  if (!dob) return null;
  const years = (Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 1) return `${Math.round(years * 12)} mo`;
  return `${Math.floor(years)} yr`;
}

export default function ClientAppPetsPage() {
  const { clientId, ready } = useClientAppSession();
  const router = useRouter();
  const [pets, setPets] = useState([]);
  const [openAdmissionByPatientId, setOpenAdmissionByPatientId] = useState({});
  const [catteryBookings, setCatteryBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ready && !clientId) router.replace('/client-app');
  }, [ready, clientId, router]);

  useEffect(() => {
    if (!ready || !clientId) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/patients?client_id=${clientId}`).then((res) => (res.ok ? res.json() : [])),
      fetch(`/api/hospitalizations?client_id=${clientId}&status=admitted`).then((res) =>
        res.ok ? res.json() : []
      ),
      fetch(`/api/cattery?client_id=${clientId}`).then((res) => (res.ok ? res.json() : [])),
    ]).then(([petsData, admissions, cattery]) => {
      if (cancelled) return;
      setCatteryBookings(Array.isArray(cattery) ? cattery : []);
      setPets(Array.isArray(petsData) ? petsData : []);
      const byPatient = {};
      for (const h of Array.isArray(admissions) ? admissions : []) {
        byPatient[h.patient_id] = h;
      }
      setOpenAdmissionByPatientId(byPatient);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, clientId]);

  // Restores the scroll position saved just before tapping a pet (see
  // renderPetCard's onClick below) — once the list has actually loaded,
  // not on first paint, since there's nothing to scroll to yet before
  // then. One-time: cleared right after use so a later fresh visit to
  // this page (not a "coming back from a pet") starts at the top as
  // normal, rather than replaying an old position forever.
  useEffect(() => {
    if (loading) return;
    const saved = sessionStorage.getItem(SCROLL_STORAGE_KEY);
    if (saved == null) return;
    sessionStorage.removeItem(SCROLL_STORAGE_KEY);
    requestAnimationFrame(() => window.scrollTo(0, Number(saved)));
  }, [loading]);

  function openPet(petId) {
    sessionStorage.setItem(SCROLL_STORAGE_KEY, String(window.scrollY));
    router.push(`/client-app/pets/${petId}`);
  }

  if (!ready) return null;

  // A pet marked RIP or rehomed (see app/client-app/pets/[id]/page.js) is
  // no longer "one of my pets" day to day — keeping it in the main list
  // forever would just make that list longer with pets the owner isn't
  // managing anymore. It's not deleted though: its full history is still
  // reachable, just moved into its own section further down instead of
  // mixed in above.
  const activePets = pets.filter((pet) => !pet.deceased && !pet.rehomed);
  const pastPets = pets.filter((pet) => pet.deceased || pet.rehomed);

  // A cat's current or next cattery stay (anything not yet checked out and
  // not already over), shown on its card like a hospital stay is.
  const today = catteryToday();
  const currentCatteryByPatient = {};
  for (const b of catteryBookings) {
    if (b.status === 'checked_out' || b.date_out < today) continue;
    const prev = currentCatteryByPatient[b.patient_id];
    if (!prev || b.date_in < prev.date_in) currentCatteryByPatient[b.patient_id] = b;
  }
  const shortDate = (iso) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  function renderPetCard(pet) {
    const admission = openAdmissionByPatientId[pet.id];
    const cattery = currentCatteryByPatient[pet.id];
    const age = ageFromDob(pet.date_of_birth);
    return (
      <li key={pet.id}>
        <div
          className="mobile-list-item client-app-pet-card"
          role="link"
          tabIndex={0}
          onClick={() => openPet(pet.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') openPet(pet.id);
          }}
        >
          <div className="client-app-pet-card-row">
            {pet.profile_photo_url ? (
              <img src={pet.profile_photo_url} alt="" className="client-app-pet-avatar-sm" />
            ) : (
              <span className="client-app-pet-avatar-sm client-app-pet-avatar-placeholder">🐾</span>
            )}
            <div>
              <span className="mobile-list-title">
                {pet.name}
                {pet.deceased && ' · RIP 🐾'}
                {pet.rehomed && ' · Rehomed'}
              </span>
              <span className="mobile-list-meta">
                {[pet.species, pet.breed, age].filter(Boolean).join(' · ')}
                {pet.current_weight_kg ? ` · ${pet.current_weight_kg} kg` : ''}
              </span>
            </div>
          </div>
          {admission && (
            <a
              href={`/portal/hospitalization/${admission.id}?app=1`}
              className="client-app-pet-admitted-link"
              onClick={(e) => e.stopPropagation()}
            >
              <HexIcon>🏥</HexIcon>
              <span>Currently at the clinic. Tap for updates</span>
            </a>
          )}
          {cattery && (
            <a
              href={`/portal/cattery/${cattery.id}?app=1`}
              className="client-app-pet-admitted-link"
              onClick={(e) => e.stopPropagation()}
            >
              <HexIcon>🐱</HexIcon>
              <span>
                {cattery.status === 'checked_in'
                  ? 'Staying in our cattery. Tap for daily updates'
                  : `Cattery booked ${shortDate(cattery.date_in)} to ${shortDate(cattery.date_out)}`}
              </span>
            </a>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="mobile-page client-app-pets-page">
      <h1>My Pets</h1>
      {loading ? (
        <p className="mobile-subtitle">Loading...</p>
      ) : pets.length === 0 ? (
        <p className="mobile-subtitle">No pets on file yet.</p>
      ) : (
        <>
          {activePets.length === 0 ? (
            <p className="mobile-subtitle">No pets on file yet.</p>
          ) : (
            <ul className="mobile-list">{activePets.map(renderPetCard)}</ul>
          )}
          {catteryBookings.length > 0 && (
            <>
              <h2 className="mobile-section-header">Cattery bookings</h2>
              <ul className="mobile-list">
                {catteryBookings.map((b) => (
                  <li key={b.id}>
                    <a href={`/portal/cattery/${b.id}?app=1`} className="mobile-list-item">
                      <span className="mobile-list-title">🐱 {b.patients?.name}</span>
                      <span className="mobile-list-meta">
                        {shortDate(b.date_in)} to {shortDate(b.date_out)}
                        {b.status === 'checked_in' ? ' · Staying with us now' : b.status === 'checked_out' ? ' · Back home' : ' · Booked'}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
          {pastPets.length > 0 && (
            <details>
              <summary className="mobile-section-header">Past Pets ({pastPets.length})</summary>
              <ul className="mobile-list">{pastPets.map(renderPetCard)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
