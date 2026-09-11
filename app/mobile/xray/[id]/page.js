// app/mobile/xray/[id]/page.js
// Record an x-ray report from a phone: dictation (tap Start Recording when
// ready) plus photos of the film/printout. Same pattern as
// app/mobile/dental/[id]/page.js and app/mobile/surgery/[id]/page.js,
// reached here from a day procedure checklist tap instead of a picker
// page (see app/mobile/day-procedures/[id]/page.js) — an x-ray report
// only ever comes from a specific diagnostic test, not a standalone
// "start one for any patient" flow like dental/surgery have.

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AudioRecorder from '@/app/_components/AudioRecorder';
import AttachmentSection from '@/app/_components/AttachmentSection';
import MobileHomeButton from '@/app/_components/MobileHomeButton';

export default function MobileXrayReportPage() {
  const { id } = useParams();
  const router = useRouter();
  const [report, setReport] = useState(null);

  useEffect(() => {
    fetch(`/api/xray-reports/${id}`)
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
          <AudioRecorder entityType="xray_report" entityId={id} />

          <h2 className="mobile-section-header">Photos</h2>
          <AttachmentSection entityType="xray_report" entityId={id} />

          <button
            type="button"
            className="mobile-secondary-action"
            onClick={() =>
              router.push(report.hospitalization_id ? `/mobile/day-procedures/${report.hospitalization_id}` : '/mobile')
            }
          >
            Done
          </button>
        </>
      )}
    </div>
  );
}
