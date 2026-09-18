// app/empty-reports/page.jsx
// Every report-type record that was started but never filled in — an
// empty "Dictate Report" shell (see GET /api/empty-reports) or a
// diagnostic test with no result logged. Linked from Settings so staff
// can periodically sweep for these and either complete them or follow up
// on why they were left blank.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const KIND_LABEL = {
  dental: 'Dental',
  surgical: 'Surgical',
  ultrasound: 'Ultrasound',
  xray: 'X-ray',
  diagnostic: 'Diagnostic',
};

function formatWhen(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function EmptyReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      fetch('/api/empty-reports')
        .then((res) => res.json())
        .then((data) => {
          setReports(Array.isArray(data) ? data : []);
          setLoading(false);
        });

    load();
    const channel = supabase
      .channel('empty-reports')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dental_reports' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'surgical_reports' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ultrasound_reports' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'xray_reports' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'diagnostics' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>Empty Reports</h1>
      </div>
      <p className="visit-meta">
        Reports and tests that were started but never filled in — no dictation ever saved, or no result ever
        logged. Open one to trace it back and either complete it or write it off.
      </p>
      {loading ? (
        <p>Loading...</p>
      ) : reports.length === 0 ? (
        <p>Nothing outstanding — every report and test on file has been filled in.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Report</th>
              <th>Patient</th>
              <th>Owner</th>
              <th>Started</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={`${r.reportType}-${r.id}`}>
                <td>{KIND_LABEL[r.reportType] || r.reportType}</td>
                <td>{r.kind}</td>
                <td>{r.patient_name || '—'}</td>
                <td>{r.client_name || '—'}</td>
                <td>{formatWhen(r.date)}</td>
                <td>
                  <a href={r.href}>Open</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
