'use client';

import { useEffect, useState } from 'react';
import AttachmentSection from './AttachmentSection';
import ClientReportEditor from './ClientReportEditor';
import ReportShareActions from './ReportShareActions';

const REPORT_TYPES = [
  ['blood', 'Blood test'],
  ['ultrasound', 'Ultrasound'],
  ['xray', 'X-ray'],
  ['pcr', 'PCR'],
  ['dental', 'Dental report'],
  ['surgical', 'Surgical report'],
];
const labels = Object.fromEntries(REPORT_TYPES);

export default function HospitalizationTestReports({ hospitalizationId, notes = [] }) {
  const [reports, setReports] = useState([]);
  const [admission, setAdmission] = useState(null);
  const [type, setType] = useState('blood');
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [generatingId, setGeneratingId] = useState(null);

  async function load() {
    const [reportsResponse, admissionResponse] = await Promise.all([
      fetch(`/api/hospitalizations/${hospitalizationId}/test-reports`),
      fetch(`/api/hospitalizations/${hospitalizationId}`),
    ]);
    const [reportData, admissionData] = await Promise.all([reportsResponse.json(), admissionResponse.json()]);
    if (reportsResponse.ok) setReports(Array.isArray(reportData) ? reportData : []);
    if (admissionResponse.ok) setAdmission(admissionData);
  }

  useEffect(() => { load(); }, [hospitalizationId]);

  async function add(e) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    const response = await fetch(`/api/hospitalizations/${hospitalizationId}/test-reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_type: type, source_text: text || null }),
    });
    const data = await response.json();
    setCreating(false);
    if (!response.ok) return setError(data.error || 'Could not add report.');
    setText('');
    setReports((prev) => [...prev, data]);
  }

  async function generate(report) {
    setError(null);
    setGeneratingId(report.id);
    const response = await fetch(`/api/hospitalizations/${hospitalizationId}/test-reports/${report.id}`, { method: 'POST' });
    const data = await response.json();
    setGeneratingId(null);
    if (!response.ok) return setError(data.error || 'Could not generate report.');
    setReports((prev) => prev.map((item) => item.id === data.id ? data : item));
  }

  async function saveSource(report, value) {
    const response = await fetch(`/api/hospitalizations/${hospitalizationId}/test-reports/${report.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_text: value }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error || 'Could not save report notes.');
    setReports((prev) => prev.map((item) => item.id === data.id ? data : item));
  }

  async function handleUploaded(report, file) {
    if (['xray', 'ultrasound'].includes(report.report_type)) return;
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(`/api/hospitalizations/${hospitalizationId}/test-reports/${report.id}/extract`, { method: 'POST', body: form });
    const data = await response.json();
    if (!response.ok) return setError(data.error || 'Could not transcribe this test document.');
    setReports((prev) => prev.map((item) => item.id === data.id ? data : item));
    await fetch(`/api/hospitalizations/${hospitalizationId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: `${labels[report.report_type]} abnormalities / factual transcription:\n${data.result_text || ''}` }),
    });
  }

  const client = admission?.clients;
  const patient = admission?.patients;
  const apiBase = `/api/hospitalizations/${hospitalizationId}/test-reports`;

  return <section className="consult-reports hospitalization-test-reports" aria-label="Hospitalization reports">
    <h3>Reports</h3>
    <p className="visit-meta">Reports and test results for this hospitalization. Review and save changes before sharing.</p>
    {error && <p className="error" role="alert">{error}</p>}

    <section className="card" aria-label="Add hospitalization report">
      <h4>Add report</h4>
      <form onSubmit={add} className="hospitalization-test-report-add">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {REPORT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste test result, procedure notes, or veterinarian findings (optional)" />
        <button type="submit" disabled={creating}>{creating ? 'Adding…' : 'Add report'}</button>
      </form>
    </section>

    {reports.length === 0 && <p>No reports or test results added to this hospitalization yet.</p>}

    {reports.map((report) => {
      const label = labels[report.report_type] || 'Report';
      const source = report.source_text || report.result_text || '';
      return <details className="card hospitalization-test-report" key={report.id}>
        <summary>{label} · {report.created_at ? new Date(report.created_at).toLocaleString() : 'Date not recorded'} · {report.ai_summary ? 'Report available' : 'Report pending'}</summary>
        <label className="report-result-field">Source notes / results
          <textarea rows={6} defaultValue={source} onBlur={(e) => saveSource(report, e.target.value)} />
        </label>
        <div className="home-links">
          <button type="button" onClick={() => generate(report)} disabled={generatingId === report.id || !source.trim()}>
            {generatingId === report.id ? 'Generating…' : report.ai_summary ? 'Regenerate report' : 'Generate report'}
          </button>
        </div>
        {report.ai_summary && <ClientReportEditor reportId={report.id} apiBase={apiBase} savedReport={report.ai_summary} onSaved={load} />}
        <ReportShareActions reportId={report.id} apiBase={apiBase} client={client} patient={patient} reportLabel={label.toLowerCase()} />
        <AttachmentSection entityType="hospitalization_test_report" entityId={report.id} onUploaded={(file) => handleUploaded(report, file)} />
      </details>;
    })}
  </section>;
}
