// app/mobile/ultrasound/[id]/page.js
// Record an ultrasound report from a phone — same pattern as
// app/mobile/xray/[id]/page.js, reached from a day procedure checklist
// tap (see app/mobile/day-procedures/[id]/page.js).

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AudioRecorder from '@/app/_components/AudioRecorder';
import AttachmentSection from '@/app/_components/AttachmentSection';
import MobileHomeButton from '@/app/_components/MobileHomeButton';

export default function MobileUltrasoundReportPage() {
  const { id } = useParams();
  const router = useRouter();
  const [report, setReport] = useState(null);

  useEffect(() => {
    fetch(`/api/ultrasound-reports/${id}`)
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
          <AudioRecorder entityType="ultrasound_report" entityId={id} />

          <h2 className="mobile-section-header">Photos</h2>
          <AttachmentSection entityType="ultrasound_report" entityId={id} />

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
