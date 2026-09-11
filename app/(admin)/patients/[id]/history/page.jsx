// app/patients/[id]/history/page.jsx
// Full Patient History: every consult/hospitalization AI summary, every
// procedure report (dental/surgical/ultrasound/x-ray), and every test
// ever recorded for this patient, in one place, newest first, full text
// (not the truncated preview PatientReportOverview shows elsewhere) —
// built from the same GET /api/patients/:id/report-overview this repo
// already uses for that shorter widget.

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { formatDateTime } from '@/lib/formatTimestamp';

const KIND_ICONS = {
  'Consult report': '🩺',
  'Hospitalization report': '🏥',
  'Dental report': '🦷',
  'Surgical report': '🔪',
  'Ultrasound report': '🔊',
  'X-ray report': '🩻',
};

function iconFor(kind) {
  return KIND_ICONS[kind] || '🧪';
}

function textFor(row) {
  return row.ai_summary || row.result || row.findings || row.notes || row.procedure_name || null;
}

export default function PatientFullHistoryPage() {
  const { id } = useParams();
  const [patient, setPatient] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/patients/${id}`).then((res) => res.json()),
      fetch(`/api/patients/${id}/report-overview`).then((res) => res.json()),
    ]).then(([patientData, rowsData]) => {
      setPatient(patientData);
      setRows(Array.isArray(rowsData) ? rowsData : []);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <p>Loading patient history...</p>;
  if (!patient || patient.error) return <p>Patient not found.</p>;

  return (
    <div>
      <p>
        <a href={`/patients/${id}`}>&larr; Back to {patient.name}</a>
      </p>
      <h1>
        Full History — {patient.name}
        {patient.patient_number ? ` (Patient #${patient.patient_number})` : ''}
      </h1>
      <p className="visit-meta">
        Every consult and hospitalization summary, procedure report, and test on file for this patient, newest
        first ({rows.length}).
      </p>

      {rows.length === 0 ? (
        <p>No reports or tests recorded for this patient yet.</p>
      ) : (
        <ul className="consult-history-list patient-full-history-list">
          {rows.map((row) => {
            const text = textFor(row);
            return (
              <li key={`${row.kind}-${row.id}`} className="consult-history-item patient-full-history-item">
                <p className="visit-meta">
                  <strong>
                    {iconFor(row.kind)} {row.kind}
                  </strong>{' '}
                  · {row.date ? formatDateTime(row.date) : 'Date not recorded'} ·{' '}
                  <a href={row.href}>Open record</a>
                </p>
                {text ? (
                  <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
                ) : (
                  <p className="visit-meta">No result recorded yet.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
