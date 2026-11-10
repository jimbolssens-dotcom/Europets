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
import { useClientAppRestore, saveClientAppCopy } from '@/app/_components/useClientAppCache';
import HomeCareLogSheet from '@/app/_components/HomeCareLogSheet';

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
  // Home care running today, per pet (app/api/client-app/home-care), and
  // the search / filter for owners with many pets.
  const [care, setCare] = useState([]);
  const [search, setSearch] = useState('');
  const [onlyCare, setOnlyCare] = useState(false);
  const [logSheet, setLogSheet] = useState(false);

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
      loadCare();
      setCatteryBookings(Array.isArray(cattery) ? cattery : []);
      setPets(Array.isArray(petsData) ? petsData : []);
      const byPatient = {};
      for (const h of Array.isArray(admissions) ? admissions : []) {
        byPatient[h.patient_id] = h;
      }
      setOpenAdmissionByPatientId(byPatient);
      setLoading(false);
      saveClientAppCopy(clientId, 'pets', {
        pets: Array.isArray(petsData) ? petsData : [],
        cattery: Array.isArray(cattery) ? cattery : [],
        admissions: byPatient,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [ready, clientId]);

  function loadCare() {
    fetch('/api/client-app/home-care')
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setCare(Array.isArray(d?.pets) ? d.pets : []))
      .catch(() => {});
  }

  // This client's last copy, shown at once while the fresh one loads
  // (useClientAppCache.js).
  useClientAppRestore('pets', (data) => {
    if (!Array.isArray(data?.pets)) return;
    setPets(data.pets);
    setCatteryBookings(Array.isArray(data.cattery) ? data.cattery : []);
    setOpenAdmissionByPatientId(data.admissions || {});
    setLoading(false);
  });

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
  const careById = Object.fromEntries(care.map((c) => [c.id, c]));
  const query = search.trim().toLowerCase();
  const shownPets = activePets.filter(
    (pet) =>
      (!onlyCare || careById[pet.id]) &&
      (!query || pet.name?.toLowerCase().includes(query) || String(pet.patient_number || '').includes(query))
  );
  const manyPets = activePets.length > 8;
  const dosesLeftToday = care.reduce((n, c) => n + c.dosesLeft, 0);
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
              href={`/client-app/cattery/${cattery.id}`}
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
      <div className="client-app-pets-head">
        <h1>My Pets</h1>
        {activePets.length > 8 && <span className="client-app-pets-count">{activePets.length}</span>}
        {activePets.length > 0 && (
          <button type="button" className="client-app-pets-log" onClick={() => setLogSheet(true)}>
            + Log{activePets.length > 1 ? ' for several' : ''}
          </button>
        )}
      </div>

      {care.length > 0 && (
        <div className="chc-card chc-today">
          <div className="chc-head">
            <span className="chc-title">Today</span>
            <span className="chc-day">{dosesLeftToday > 0 ? `${dosesLeftToday} left to do` : 'all done ✓'}</span>
          </div>
          {care.map((c) => (
            <button type="button" key={c.id} className="chc-today-pet" onClick={() => openPet(c.id)}>
              {c.profile_photo_url ? <img src={c.profile_photo_url} alt="" className="chc-today-avatar" /> : <span className="chc-today-avatar">🐾</span>}
              <span className="chc-today-text">
                <b>{c.name}</b>{c.patient_number ? <span className="chc-small"> #{c.patient_number}</span> : null}
                <span className="chc-small chc-today-lines">{c.todayLines.join(' · ') || 'Keep doing'}</span>
              </span>
              <span className={`chc-left${c.dosesLeft === 0 ? ' done' : ''}`}>{c.dosesLeft === 0 ? '✓ done' : `${c.dosesLeft} left`}</span>
            </button>
          ))}
        </div>
      )}

      {manyPets && (
        <>
          <input className="client-app-pets-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search by name or number" />
          {care.length > 0 && (
            <div className="client-app-pets-filters">
              <button type="button" className={onlyCare ? 'on' : ''} onClick={() => setOnlyCare(true)}>On home care ({care.length})</button>
              <button type="button" className={!onlyCare ? 'on' : ''} onClick={() => setOnlyCare(false)}>All</button>
            </div>
          )}
        </>
      )}

      {logSheet && (
        <HomeCareLogSheet
          pets={[...activePets]
            .sort((a, b) => (careById[b.id] ? 1 : 0) - (careById[a.id] ? 1 : 0) || a.name.localeCompare(b.name))
            .map((p) => ({ id: p.id, name: p.name, patient_number: p.patient_number, hint: careById[p.id] ? 'on home care' : null }))}
          selected={activePets.length === 1 ? [activePets[0].id] : []}
          pickMany={activePets.length > 1}
          onClose={() => setLogSheet(false)}
          onSaved={loadCare}
        />
      )}
      {loading ? (
        <p className="mobile-subtitle">Loading...</p>
      ) : pets.length === 0 ? (
        <p className="mobile-subtitle">No pets on file yet.</p>
      ) : (
        <>
          {activePets.length === 0 ? (
            <p className="mobile-subtitle">No pets on file yet.</p>
          ) : (
            <>
              <ul className="mobile-list">{(manyPets ? shownPets.slice(0, query ? 200 : 60) : activePets).map(renderPetCard)}</ul>
              {manyPets && shownPets.length === 0 && <p className="mobile-subtitle">No pet with that name.</p>}
              {manyPets && !query && shownPets.length > 60 && (
                <p className="mobile-subtitle">Showing 60 of {shownPets.length}. Search to find the others.</p>
              )}
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
