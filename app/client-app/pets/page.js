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
    ]).then(([petsData, admissions]) => {
      if (cancelled) return;
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

  if (!ready) return null;

  // A pet marked RIP or rehomed (see app/client-app/pets/[id]/page.js) is
  // no longer "one of my pets" day to day — keeping it in the main list
  // forever would just make that list longer with pets the owner isn't
  // managing anymore. It's not deleted though: its full history is still
  // reachable, just moved into its own section further down instead of
  // mixed in above.
  const activePets = pets.filter((pet) => !pet.deceased && !pet.rehomed);
  const pastPets = pets.filter((pet) => pet.deceased || pet.rehomed);

  function renderPetCard(pet) {
    const admission = openAdmissionByPatientId[pet.id];
    const age = ageFromDob(pet.date_of_birth);
    return (
      <li key={pet.id}>
        <div
          className="mobile-list-item client-app-pet-card"
          role="link"
          tabIndex={0}
          onClick={() => router.push(`/client-app/pets/${pet.id}`)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') router.push(`/client-app/pets/${pet.id}`);
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
              <span>Currently at the clinic — tap for updates</span>
            </a>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="mobile-page">
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
