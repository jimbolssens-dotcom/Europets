// app/mobile/day-procedures/[id]/vaccination/page.js
// Log a vaccination from a day procedure's checklist — same species-
// filtered form the desktop consult page uses (useVaccinations +
// VaccinationForm), just reached from a checklist tap instead. The
// checklist item (passed as ?item=) is only marked done once a
// vaccination is actually saved, not just for opening this screen.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import MobileHomeButton from '@/app/_components/MobileHomeButton';
import { useMobileStaff } from '@/app/_components/useMobileStaff';
import { useVaccinations } from '@/app/_components/useVaccinations';
import VaccinationForm from '@/app/_components/VaccinationForm';
import VaccinationHistory from '@/app/_components/VaccinationHistory';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default function MobileDayProcedureVaccinationPage() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const itemId = searchParams.get('item');
  const { staffId, ready: staffReady } = useMobileStaff();
  const [admission, setAdmission] = useState(null);
  const [staff, setStaff] = useState([]);
  const [marking, setMarking] = useState(false);
  const initialCountRef = useRef(null);

  useEffect(() => {
    fetch(`/api/hospitalizations/${id}`).then((res) => res.json()).then(setAdmission);
    fetch('/api/staff')
      .then((res) => res.json())
      .then((data) => setStaff(Array.isArray(data) ? data : []));
  }, [id]);

  const vac = useVaccinations(admission?.patients?.id, admission?.patients?.species);

  useEffect(() => {
    if (initialCountRef.current === null) {
      initialCountRef.current = vac.vaccinations.length;
      return;
    }
    if (!itemId || marking) return;
    if (vac.vaccinations.length > initialCountRef.current) {
      setMarking(true);
      fetch(`/api/hospitalizations/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author_id: staffId || null,
          note_date: todayISODate(),
          notes: 'Vaccination logged',
          plan_item_ids: [itemId],
        }),
      }).finally(() => router.push(`/mobile/day-procedures/${id}`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vac.vaccinations.length]);

  if (!admission || !staffReady) return <div className="mobile-page"><MobileHomeButton /><p>Loading...</p></div>;

  return (
    <div className="mobile-page">
      <MobileHomeButton />
      <h1>
        {admission.patients?.name}
        {admission.patients?.patient_number ? ` (Patient #${admission.patients.patient_number})` : ''}
      </h1>
      <p className="mobile-subtitle">Vaccination</p>

      {vac.vaccinations.length > 0 && (
        <VaccinationHistory vaccinations={vac.vaccinations} onDelete={vac.deleteVaccination} />
      )}
      <VaccinationForm {...vac} species={admission.patients?.species} staff={staff} />

      <button type="button" className="mobile-secondary-action" onClick={() => router.push(`/mobile/day-procedures/${id}`)}>
        Back without logging
      </button>
    </div>
  );
}
