'use client';
import { useEffect, useState } from 'react';

export default function PatientReportOverview({ patientId }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { if (patientId) fetch(`/api/patients/${patientId}/report-overview`).then((r) => r.json()).then((d) => setRows(Array.isArray(d) ? d : [])); }, [patientId]);
  return <details className="patient-report-overview">
    <summary>📑 Report overview {rows.length ? `(${rows.length})` : ''}</summary>
    {rows.length === 0 ? <p className="visit-meta">No consult or hospitalization reports yet.</p> : <ul className="consult-history-list">{rows.map((r) => <li key={`${r.source}-${r.id}`} className="consult-history-item"><p className="visit-meta"><strong>{r.kind}</strong> · {r.date ? new Date(r.date).toLocaleString() : 'Date not recorded'} · <a href={r.href}>Open {r.source}</a></p>{(r.ai_summary || r.result_text || r.result || r.findings) && <p>{(r.ai_summary || r.result_text || r.result || r.findings).slice(0, 240)}</p>}</li>)}</ul>}
  </details>;
}
