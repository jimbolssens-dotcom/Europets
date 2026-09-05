// app/mobile/dental/[id]/page.js
// Record a dental report from a phone: the same interactive dental chart
// desktop uses (tap a tooth to mark extracted/missing), dictation (tap
// Start Recording when ready — this page is reached right after creating
// a blank report via the picker, same as desktop's "Dictate New Dental
// Report", but doesn't start listening on its own), and photos. Nothing
// to type by hand; review/edit the fuller record on the desktop consult
// page afterward.

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AudioRecorder from '@/app/_components/AudioRecorder';
import AttachmentSection from '@/app/_components/AttachmentSection';
import DentalChart from '@/app/_components/DentalChart';
import MobileHomeButton from '@/app/_components/MobileHomeButton';

export default function MobileDentalReportPage() {
  const { id } = useParams();
  const router = useRouter();
  const [report, setReport] = useState(null);
  const [visit, setVisit] = useState(null);
  const [savingChart, setSavingChart] = useState(false);

  useEffect(() => {
    fetch(`/api/dental-reports/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setReport(data);
        if (data.visit_id) {
          fetch(`/api/visits/${data.visit_id}`)
            .then((res) => res.json())
            .then(setVisit);
        }
      });
  }, [id]);

  async function updateDentalChart(newChart) {
    if (!visit?.patients?.id) return;
    setSavingChart(true);
    const res = await fetch(`/api/patients/${visit.patients.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dental_chart: newChart }),
    });
    const data = await res.json();
    setSavingChart(false);
    if (res.ok) {
      setVisit((prev) => ({ ...prev, patients: { ...prev.patients, dental_chart: data.dental_chart } }));
    }
  }

  return (
    <div className="mobile-page">
      <MobileHomeButton />
      {visit && (
        <>
          <h1>{visit.patients?.name}</h1>
          <p className="mobile-subtitle">
            {visit.clients?.full_name} · {visit.patients?.species}
          </p>

          <p className="mobile-hint">
            Tap Start Recording when you're ready to dictate — it fills in the report directly,
            nothing to type. Tap a tooth below to mark it extracted or missing.
          </p>
          <AudioRecorder entityType="dental_report" entityId={id} />

          <h2 className="mobile-section-header">Dental Chart</h2>
          <DentalChart
            species={visit.patients?.species}
            value={visit.patients?.dental_chart}
            onChange={updateDentalChart}
            saving={savingChart}
          />

          <h2 className="mobile-section-header">Photos</h2>
          <AttachmentSection entityType="dental_report" entityId={id} />

          <button
            type="button"
            className="mobile-secondary-action"
            onClick={() => router.push('/mobile/dental')}
          >
            Done
          </button>
        </>
      )}
    </div>
  );
}
