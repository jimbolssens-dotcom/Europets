'use client';
import { useEffect, useState } from 'react';

const labels = { blood: 'Blood test', ultrasound: 'Ultrasound', xray: 'X-ray', dental: 'Dental', surgical: 'Surgical' };
export default function HospitalizationTestReports({ hospitalizationId, notes = [] }) {
  const [reports, setReports] = useState([]);
  const [type, setType] = useState('blood');
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const hasTest = notes.some((note) => note.treatment_items?.some((item) =>
    item.goods_services?.main_category === 'test' || /blood|ultrasound|x-ray|xray|radiograph|dental|surg/i.test(item.goods_services?.name || '')
  ));
  async function load() { const r = await fetch(`/api/hospitalizations/${hospitalizationId}/test-reports`); const d = await r.json(); if (r.ok) setReports(d); }
  useEffect(() => { load(); }, [hospitalizationId]);
  async function add(e) {
    e.preventDefault(); setError(null);
    const r = await fetch(`/api/hospitalizations/${hospitalizationId}/test-reports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report_type: type, source_text: text }) });
    const d = await r.json(); if (!r.ok) return setError(d.error);
    setText(''); setReports((prev) => [...prev, d]);
  }
  async function addBlank(reportType) {
    setError(null);
    const r = await fetch(`/api/hospitalizations/${hospitalizationId}/test-reports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report_type: reportType }) });
    const d = await r.json();
    if (!r.ok) return setError(d.error);
    setReports((prev) => [...prev, d]);
  }
  async function generate(report) {
    setError(null); const r = await fetch(`/api/hospitalizations/${hospitalizationId}/test-reports/${report.id}`, { method: 'POST' });
    const d = await r.json(); if (!r.ok) return setError(d.error); setReports((prev) => prev.map((item) => item.id === d.id ? d : item));
  }
  async function save(report, field, value) {
    const r = await fetch(`/api/hospitalizations/${hospitalizationId}/test-reports/${report.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value }) });
    const d = await r.json(); if (r.ok) setReports((prev) => prev.map((item) => item.id === d.id ? d : item));
  }
  if (!hasTest && reports.length === 0) return <section className="hospitalization-test-reports card" aria-label="Hospitalization procedures">
    <h2>Procedures</h2><p className="visit-meta">Add a dental or surgical procedure performed during this hospitalization. The report opens for findings and AI drafting.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="hospitalization-procedure-actions"><button type="button" onClick={() => addBlank('dental')}>Add dental report</button><button type="button" onClick={() => addBlank('surgical')}>Add surgical report</button></div>
  </section>;
  return <section className="hospitalization-test-reports card" aria-label="Hospitalization test reports">
    <h2>Diagnostics &amp; reports</h2><p className="visit-meta">Blood results are transcribed and summarized factually. Ultrasound and X-ray reports use only saved veterinarian findings; images are never interpreted. Dental and surgical procedures can be documented here too.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <form onSubmit={add} className="hospitalization-test-report-add"><select value={type} onChange={(e) => setType(e.target.value)}><option value="blood">Blood test</option><option value="ultrasound">Ultrasound</option><option value="xray">X-ray</option><option value="dental">Dental procedure</option><option value="surgical">Surgical procedure</option></select><textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste result or veterinarian findings" required /><button type="submit">Add report</button></form>
    <div className="hospitalization-procedure-actions"><button type="button" onClick={() => addBlank('dental')}>Add dental report</button><button type="button" onClick={() => addBlank('surgical')}>Add surgical report</button></div>
    {reports.map((report) => <details key={report.id} className="hospitalization-test-report"><summary>{labels[report.report_type]} · {report.ai_summary ? 'Report ready' : 'Report pending'}</summary><label>Saved result or veterinarian findings<textarea rows={5} defaultValue={report.source_text || report.result_text || ''} onBlur={(e) => save(report, 'source_text', e.target.value)} /></label>{report.ai_summary && <label>Generated report<textarea rows={6} defaultValue={report.ai_summary} onBlur={(e) => save(report, 'ai_summary', e.target.value)} /></label>}<button type="button" onClick={() => generate(report)}>{report.ai_summary ? 'Regenerate report' : 'Generate report'}</button></details>)}
  </section>;
}
