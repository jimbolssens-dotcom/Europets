// app/imaging-reports/page.jsx
// Every saved ultrasound and x-ray report across the clinic, newest first —
// "saved" meaning actually dictated and written up (ai_summary set), not
// just the empty shell created the moment "Dictate Report" is clicked on a
// consult's Diagnostics tab. That distinction matters because the source
// recording gets deleted automatically once its contents are captured here
// (see AudioRecorder's delete-on-done cleanup) — this page is where staff
// can confirm a report actually made it onto the record before trusting
// that the audio is safe to have lost.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import InfoHint from '@/app/_components/InfoHint';

function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ImagingReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () =>
    Promise.all([
      fetch('/api/ultrasound-reports').then((res) => res.json()),
      fetch('/api/xray-reports').then((res) => res.json()),
    ]).then(([ultrasound, xray]) => {
      const tagged = [
        ...(Array.isArray(ultrasound) ? ultrasound : []).map((r) => ({ ...r, type: 'ultrasound' })),
        ...(Array.isArray(xray) ? xray : []).map((r) => ({ ...r, type: 'xray' })),
      ].sort((a, b) => new Date(b.performed_at) - new Date(a.performed_at));
      setReports(tagged);
      setLoading(false);
    });

  useEffect(() => {
    load();
    const channel = supabase
      .channel('imaging-reports')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ultrasound_reports' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'xray_reports' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  if (loading) return <p>Loading imaging reports...</p>;

  return (
    <div>
      <h1>
        Imaging Reports{' '}
        <InfoHint>
          Every saved ultrasound and x-ray report, across every patient — a report only shows up
          here once it&apos;s actually been dictated and written up, not the moment &quot;Dictate
          Report&quot; is clicked on a consult.
        </InfoHint>
      </h1>

      {reports.length === 0 ? (
        <p>No saved imaging reports yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Patient</th>
              <th>Owner</th>
              <th>Performed</th>
              <th>Vet</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => {
              const apiBase = r.type === 'ultrasound' ? '/api/ultrasound-reports' : '/api/xray-reports';
              return (
                <tr key={`${r.type}-${r.id}`}>
                  <td>{r.type === 'ultrasound' ? '🔊 Ultrasound' : '🩻 X-ray'}</td>
                  <td>
                    <a href={`/patients/${r.visits?.patients?.id}`}>{r.visits?.patients?.name || '—'}</a>
                  </td>
                  <td>{r.visits?.clients?.full_name || '—'}</td>
                  <td>{formatDateTime(r.performed_at)}</td>
                  <td>{r.staff?.full_name || 'unassigned'}</td>
                  <td>
                    <a href={`/consults/${r.visit_id}`}>View consult</a>{' '}
                    <a href={`${apiBase}/${r.id}/report-pdf`} target="_blank" rel="noreferrer">
                      Download
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
