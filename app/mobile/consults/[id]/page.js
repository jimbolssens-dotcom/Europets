// app/mobile/consults/[id]/page.js
// Record a consult from a phone. Recording fills in the Vitals & Exam
// fields (and matched diagnostics/treatment items) directly on the visit
// — the exact same pipeline the desktop consult page uses — so there's
// nothing to review or save here; just record and walk away. The full
// record is still on the desktop consult page for editing afterward.

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AudioRecorder from '@/app/_components/AudioRecorder';

export default function MobileConsultPage() {
  const { id } = useParams();
  const [consult, setConsult] = useState(null);

  useEffect(() => {
    fetch(`/api/visits/${id}`)
      .then((res) => res.json())
      .then(setConsult);
  }, [id]);

  return (
    <div className="mobile-page">
      <a href="/mobile/consults" className="mobile-back">
        &larr; Consults
      </a>
      {consult && (
        <>
          <h1>{consult.patients?.name}</h1>
          <p className="mobile-subtitle">
            {consult.clients?.full_name} · {consult.patients?.species}
          </p>
          <p className="mobile-hint">
            Recording fills in Anamnesis, Findings, Diagnosis, Prognosis, and Treatment plan
            directly, plus matches diagnostics/medications you mention against the catalog.
            Nothing to save here — review or edit on the desktop consult page anytime.
          </p>
          <AudioRecorder entityType="visit" entityId={id} />
          <a href={`/consults/${id}`} className="mobile-desktop-link">
            View full consult &rarr;
          </a>
        </>
      )}
    </div>
  );
}
