// app/mobile/surgery/[id]/page.js
// Record a surgical report from a phone: dictation (tap Start Recording
// when ready — this page is reached right after creating a blank report
// from app/mobile/day-procedures/[id], same as desktop's "Dictate New
// Surgical Report", but doesn't start listening on its own) plus photos.
// Nothing to type by hand; review/edit the fuller record on the desktop
// hospitalization page afterward.
//
// A surgical report used to also start from its own standalone mobile
// picker (pick today's consult patient directly, no day procedure
// involved) — retired once the clinic confirmed a surgery is now never
// done without a Day Procedure booking, so this page is only ever
// reached via a day procedure now.

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AudioRecorder from '@/app/_components/AudioRecorder';
import AttachmentSection from '@/app/_components/AttachmentSection';
import MobileHomeButton from '@/app/_components/MobileHomeButton';

export default function MobileSurgicalReportPage() {
  const { id } = useParams();
  const router = useRouter();
  const [report, setReport] = useState(null);

  useEffect(() => {
    fetch(`/api/surgical-reports/${id}`)
      .then((res) => res.json())
      .then(setReport);
  }, [id]);

  const patient = report?.visits?.patients || report?.hospitalizations?.patients;
  const client = report?.visits?.clients || report?.hospitalizations?.clients;

  return (
    <div className="mobile-page">
      <MobileHomeButton />
      {report && (
        <>
          <h1>
            {patient?.name}
            {patient?.patient_number ? ` (Patient #${patient.patient_number})` : ''}
          </h1>
          <p className="mobile-subtitle">
            {client?.full_name}
            {client?.client_number ? ` (Client #${client.client_number})` : ''} · {patient?.species}
          </p>

          <p className="mobile-hint">
            Tap Start Recording when you're ready to dictate — it fills in the report directly,
            nothing to type.
          </p>
          <AudioRecorder entityType="surgical_report" entityId={id} />

          <h2 className="mobile-section-header">Photos</h2>
          <AttachmentSection entityType="surgical_report" entityId={id} />

          <button
            type="button"
            className="mobile-secondary-action"
            onClick={() => router.push('/mobile/surgery')}
          >
            Done
          </button>
        </>
      )}
    </div>
  );
}
