// app/mobile/scan/[kind]/[id]/page.js
// One ultrasound / x-ray / gastroscopy report on a phone: the same report
// card as on desktop (ScanReportCard: Dictate, Findings, Generate report,
// Owner / Vet share, images), so a scan can be finished and sent from the
// phone (Jim, 19 Nov). Reached from a day procedure tile, the phone
// hospital plan and the old /mobile/xray|ultrasound|gastroscopy links.

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import MobileHomeButton from '@/app/_components/MobileHomeButton';
import ScanReportCard from '@/app/_components/ScanReportCard';
import { SCAN_KINDS, testsForReport } from '@/lib/scanReports';

export default function MobileScanReportPage() {
  const { kind, id } = useParams();
  const router = useRouter();
  const meta = SCAN_KINDS[kind];
  const [report, setReport] = useState(null);
  const [siblings, setSiblings] = useState([]);
  const [diagnostics, setDiagnostics] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState(null);

  async function load() {
    if (!meta) return;
    const res = await fetch(`${meta.apiBase}/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error || 'Report not found');
    setReport(data);
    const query = data.visit_id ? `visit_id=${data.visit_id}` : `hospitalization_id=${data.hospitalization_id}`;
    const [list, diags] = await Promise.all([
      fetch(`${meta.apiBase}?${query}`).then((r) => r.json()).catch(() => []),
      fetch(`/api/diagnostics?${query}`).then((r) => r.json()).catch(() => []),
    ]);
    setSiblings(Array.isArray(list) ? list : []);
    setDiagnostics(Array.isArray(diags) ? diags : []);
  }

  useEffect(() => {
    load();
    fetch('/api/goods-services?active=true').then((r) => r.json()).then((d) => setCatalog(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/staff?active=true').then((r) => r.json())
      .then((d) => setStaff(Array.isArray(d) ? d.filter((s) => s.role === 'vet' || s.role === 'tech') : [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  if (!meta) return <div className="mobile-page"><MobileHomeButton /><p className="error">Unknown scan type.</p></div>;

  const owner = report?.visits || report?.hospitalizations;
  const patient = owner?.patients;
  const client = owner?.clients;
  const record = { patients: patient, clients: client ? { ...client, id: owner?.client_id } : null };
  const nameOf = (d) => catalog.find((c) => c.id === d.goods_service_id)?.name || d.description || 'Test';
  const back = report?.visit_id ? `/mobile/consults/${report.visit_id}` : report?.hospitalization_id ? `/mobile/day-procedures/${report.hospitalization_id}` : '/mobile';

  return (
    <div className="mobile-page">
      <MobileHomeButton />
      {error && <p className="error">{error}</p>}
      {report && (
        <>
          <h1>
            {patient?.name}
            {patient?.patient_number ? ` #${patient.patient_number}` : ''}
          </h1>
          <p className="mobile-subtitle">
            {client?.full_name}
            {client?.client_number ? ` #${client.client_number}` : ''} · {patient?.species}
          </p>
          <ScanReportCard kind={kind} report={report} record={record} staff={staff} onChanged={load} open
            tests={testsForReport(report, kind, diagnostics, siblings.length ? siblings : [report], nameOf)} />
          <button type="button" className="mobile-secondary-action" onClick={() => (window.history.length > 1 ? router.back() : router.push(back))}>
            Done
          </button>
        </>
      )}
    </div>
  );
}
