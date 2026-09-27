// app/client-app/reports/page.js
// The logged-in client's reports across all their pets — consult/
// hospitalization summaries, dental, surgical, ultrasound, X-ray and
// diagnostic-test reports. Reuses /api/patients/:id/report-overview (the
// same aggregator the staff-facing patient page uses) for the list, then
// links each row to the report-type's own PDF route — the same public
// PDF routes the "send to client via WhatsApp" buttons already use
// elsewhere in the app (see middleware.js's PUBLIC_PATTERNS), so nothing
// new had to be built to serve these.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClientAppSession } from '@/app/_components/useClientAppSession';
import { reportPdfHref } from '@/lib/clientAppReports';
import { formatShortDate } from '@/lib/formatTimestamp';

export default function ClientAppReportsPage() {
  const { clientId, ready } = useClientAppSession();
  const router = useRouter();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ready && !clientId) router.replace('/client-app');
  }, [ready, clientId, router]);

  useEffect(() => {
    if (!ready || !clientId) return;
    let cancelled = false;
    fetch(`/api/patients?client_id=${clientId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then(async (pets) => {
        const petList = Array.isArray(pets) ? pets : [];
        const byPet = await Promise.all(
          petList.map((pet) =>
            fetch(`/api/patients/${pet.id}/report-overview`)
              .then((res) => (res.ok ? res.json() : []))
              .then((rows) => rows.map((r) => ({ ...r, petName: pet.name })))
          )
        );
        if (cancelled) return;
        const merged = byPet.flat().sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        setReports(merged);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, clientId]);

  if (!ready) return null;

  return (
    <div className="mobile-page client-app-reports-page">
      <h1>Reports</h1>
      {loading ? (
        <p className="mobile-subtitle">Loading...</p>
      ) : reports.length === 0 ? (
        <p className="mobile-subtitle">No reports yet.</p>
      ) : (
        <>
          <div className="client-app-table-head client-app-desktop-only-inline">
            <span className="client-app-table-head-primary">Report</span>
            <span className="client-app-table-head-secondary">Pet</span>
            <span className="client-app-table-head-date">Date</span>
            <span className="client-app-table-head-action" />
          </div>
          <ul className="mobile-list">
            {reports.map((row) => {
              const href = reportPdfHref(row);
              const Tag = href ? 'a' : 'div';
              return (
                <li key={row.id}>
                  <Tag
                    {...(href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="mobile-list-item client-app-table-row"
                  >
                    <span className="mobile-list-title client-app-mobile-only-inline">
                      {row.kind} — {row.petName}
                    </span>
                    <span className="mobile-list-meta client-app-mobile-only-inline">
                      {row.date ? formatShortDate(row.date) : 'Undated'}
                    </span>
                    <span className="client-app-table-cell client-app-table-cell-primary client-app-desktop-only-inline">
                      {row.kind}
                    </span>
                    <span className="client-app-table-cell client-app-table-cell-secondary client-app-desktop-only-inline">
                      {row.petName}
                    </span>
                    <span className="client-app-table-cell client-app-table-cell-date client-app-desktop-only-inline">
                      {row.date ? formatShortDate(row.date) : 'Undated'}
                    </span>
                    {href && (
                      <span className="client-app-table-cell client-app-table-cell-action client-app-desktop-only-inline">
                        Open PDF ↗
                      </span>
                    )}
                  </Tag>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
