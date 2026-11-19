// app/_components/ScanReportList.jsx
// Every ultrasound / x-ray / gastroscopy report on one consult or stay, as
// the shared report cards (ScanReportCard): the phone's view of a case's
// scans (Jim, 19 Nov), on the phone consult, hospital and day procedure
// pages. Shows nothing when the case has no scan.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ScanReportCard from './ScanReportCard';
import { SCAN_KINDS, testsForReport } from '@/lib/scanReports';

export default function ScanReportList({ visitId, hospitalizationId, record, openReportId, heading = 'Scans' }) {
  const [reports, setReports] = useState({});
  const [diagnostics, setDiagnostics] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [staff, setStaff] = useState([]);
  const query = visitId ? `visit_id=${visitId}` : `hospitalization_id=${hospitalizationId}`;

  async function load() {
    const [lists, diags] = await Promise.all([
      Promise.all(Object.entries(SCAN_KINDS).map(([kind, meta]) =>
        fetch(`${meta.apiBase}?${query}`).then((r) => r.json()).then((d) => [kind, Array.isArray(d) ? d : []]).catch(() => [kind, []]))),
      fetch(`/api/diagnostics?${query}`).then((r) => r.json()).catch(() => []),
    ]);
    setReports(Object.fromEntries(lists));
    setDiagnostics(Array.isArray(diags) ? diags : []);
  }

  useEffect(() => {
    if (!visitId && !hospitalizationId) return undefined;
    load();
    fetch('/api/goods-services?active=true').then((r) => r.json()).then((d) => setCatalog(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/staff?active=true').then((r) => r.json())
      .then((d) => setStaff(Array.isArray(d) ? d.filter((s) => s.role === 'vet' || s.role === 'tech') : [])).catch(() => {});
    const column = visitId ? 'visit_id' : 'hospitalization_id';
    const value = visitId || hospitalizationId;
    let channel = supabase.channel(`scan-reports-${value}`);
    for (const table of [...Object.values(SCAN_KINDS).map((m) => m.table), 'diagnostics']) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `${column}=eq.${value}` }, load);
    }
    channel.subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const nameOf = (d) => catalog.find((c) => c.id === d.goods_service_id)?.name || d.description || 'Test';
  const cards = Object.entries(reports).flatMap(([kind, list]) => list.map((report) => ({ kind, report, list })));
  if (!cards.length) return null;
  return (
    <section className="scan-report-list" aria-label={heading}>
      <h2 className="mobile-section-header">{heading}</h2>
      {cards.map(({ kind, report, list }) => (
        <ScanReportCard key={report.id} kind={kind} report={report} record={record} staff={staff} onChanged={load}
          open={openReportId === report.id} tests={testsForReport(report, kind, diagnostics, list, nameOf)} />
      ))}
    </section>
  );
}
