// app/client-app/pets/[id]/page.js
// A single pet's full history for the logged-in client — every consult/
// hospitalization summary, procedure report, and test on file, newest
// first, full text (not just a link out) — the client-facing equivalent
// of the staff-only app/(admin)/patients/[id]/history page, built from
// the same GET /api/patients/:id/report-overview aggregator. Read-only:
// editing/deleting a report is a staff action, not exposed here.

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useClientAppSession } from '@/app/_components/useClientAppSession';
import HexIcon from '@/app/_components/HexIcon';
import { formatDateTime } from '@/lib/formatTimestamp';
import { reportPdfHref, reportText, reportKindIcon } from '@/lib/clientAppReports';

function ageFromDob(dob) {
  if (!dob) return null;
  const years = (Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 1) return `${Math.round(years * 12)} mo`;
  return `${Math.floor(years)} yr`;
}

export default function ClientAppPetHistoryPage() {
  const { id } = useParams();
  const { clientId, ready } = useClientAppSession();
  const router = useRouter();
  const [pet, setPet] = useState(null);
  const [rows, setRows] = useState([]);
  const [admission, setAdmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (ready && !clientId) router.replace('/client-app');
  }, [ready, clientId, router]);

  useEffect(() => {
    if (!ready || !clientId) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/patients/${id}`).then((res) => (res.ok ? res.json() : null)),
      fetch(`/api/patients/${id}/report-overview`).then((res) => (res.ok ? res.json() : [])),
      fetch(`/api/hospitalizations?patient_id=${id}&status=admitted`).then((res) => (res.ok ? res.json() : [])),
    ]).then(([petData, rowsData, admissions]) => {
      if (cancelled) return;
      // Not this client's pet — don't leak another client's history via a
      // guessed/typed-in patient id.
      if (!petData || petData.error || petData.client_id !== clientId) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setPet(petData);
      setRows(Array.isArray(rowsData) ? rowsData : []);
      setAdmission(Array.isArray(admissions) && admissions.length > 0 ? admissions[0] : null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, clientId, id]);

  if (!ready || loading) return null;

  if (notFound) {
    return (
      <div className="mobile-page">
        <p className="mobile-subtitle">Pet not found.</p>
        <Link href="/client-app/pets" className="mobile-link-btn">
          Back to My Pets
        </Link>
      </div>
    );
  }

  const age = ageFromDob(pet.date_of_birth);

  return (
    <div className="mobile-page">
      <Link href="/client-app/pets" className="mobile-link-btn">
        ← My Pets
      </Link>
      <h1>{pet.name}</h1>
      <p className="mobile-subtitle">
        {[pet.species, pet.breed, age].filter(Boolean).join(' · ')}
        {pet.current_weight_kg ? ` · ${pet.current_weight_kg} kg` : ''}
      </p>

      {admission && (
        <div className="client-app-admission-alert">
          <a href={`/portal/hospitalization/${admission.id}`} className="client-app-admission-alert-link">
            <HexIcon>🏥</HexIcon>
            <span>Currently at the clinic — tap for updates</span>
          </a>
        </div>
      )}

      <p className="mobile-section-header">Full History</p>
      {rows.length === 0 ? (
        <p className="mobile-subtitle">No reports or tests recorded yet.</p>
      ) : (
        <ul className="mobile-list">
          {rows.map((row) => {
            const text = reportText(row);
            const pdfHref = reportPdfHref(row);
            return (
              <li key={row.id}>
                <div className="mobile-list-item">
                  <span className="mobile-list-title">
                    {reportKindIcon(row.kind)} {row.kind}
                  </span>
                  <span className="mobile-list-meta">{row.date ? formatDateTime(row.date) : 'Undated'}</span>
                  {text ? (
                    <p className="client-app-report-text">{text}</p>
                  ) : (
                    <span className="mobile-list-meta">No result recorded yet.</span>
                  )}
                  {pdfHref && (
                    <a
                      href={pdfHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="client-app-report-pdf-link"
                    >
                      View PDF
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
