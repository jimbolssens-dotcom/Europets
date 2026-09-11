// app/_components/HospitalizationReportsSection.jsx
// The hospitalization page's single "Reports" section — replaces the old
// HospitalizationTestReports. Orders tests off the catalog and dictates
// dental/surgical/ultrasound/x-ray reports the same way the consult page
// does (see app/(admin)/consults/[id]/page.jsx's Exam & Notes / Procedures
// tabs), scoped to this hospitalization instead of a visit, then hands
// everything to RecordReports for the actual review/generate/share view —
// kept to one consolidated section instead of consult's separate tabs,
// since this page has no tab bar.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import AttachmentSection from './AttachmentSection';
import AudioRecorder from './AudioRecorder';
import CatalogPicker from './CatalogPicker';
import DentalChart from './DentalChart';
import RecordReports from './RecordReports';
import { isUltrasoundTest } from '@/lib/ultrasoundProduct';
import { isXrayTest } from '@/lib/xrayProduct';

const LEGACY_DIAGNOSTIC_TYPE_LABELS = {
  blood: 'Blood test',
  pcr: 'PCR',
  blood_test: 'Blood test',
  xray: 'X-ray',
  ultrasound: 'Ultrasound',
  other: 'Other',
};

export default function HospitalizationReportsSection({ hospitalizationId, admission, staff, catalog, subcategories, onCatalogItemCreated, onPatientUpdated }) {
  const [diagnostics, setDiagnostics] = useState([]);
  const [diagForm, setDiagForm] = useState({ goods_service_id: '', description: '' });
  const [diagError, setDiagError] = useState(null);
  const [resultDrafts, setResultDrafts] = useState({});
  const [savingResultId, setSavingResultId] = useState(null);
  const [resultError, setResultError] = useState(null);
  const [reportsError, setReportsError] = useState({});
  const [extractingResultId, setExtractingResultId] = useState(null);
  const [extractResultError, setExtractResultError] = useState({});
  const [diagPhotoVersion, setDiagPhotoVersion] = useState({});

  const [surgicalReports, setSurgicalReports] = useState([]);
  const [surgForm, setSurgForm] = useState({ surgeon_id: '', procedure_name: '', notes: '' });
  const [dictatingSurgical, setDictatingSurgical] = useState(false);
  const [autoRecordSurgicalId, setAutoRecordSurgicalId] = useState(null);

  const [dentalReports, setDentalReports] = useState([]);
  const [dentalForm, setDentalForm] = useState({ performed_by: '', findings: '', procedures_performed: '', notes: '' });
  const [dictatingDental, setDictatingDental] = useState(false);
  const [autoRecordDentalId, setAutoRecordDentalId] = useState(null);
  const [savingDentalChart, setSavingDentalChart] = useState(false);

  const [ultrasoundReports, setUltrasoundReports] = useState([]);
  const [dictatingUltrasoundFor, setDictatingUltrasoundFor] = useState(null);
  const [autoRecordUltrasoundId, setAutoRecordUltrasoundId] = useState(null);

  const [xrayReports, setXrayReports] = useState([]);
  const [dictatingXrayFor, setDictatingXrayFor] = useState(null);
  const [autoRecordXrayId, setAutoRecordXrayId] = useState(null);

  const [generatingReportId, setGeneratingReportId] = useState(null);
  const [generateReportError, setGenerateReportError] = useState(null);
  const [generateReportErrorId, setGenerateReportErrorId] = useState(null);

  async function loadReportList(path, setter) {
    try {
      const res = await fetch(`/api/${path}?hospitalization_id=${hospitalizationId}`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error();
      setter(data);
      setReportsError((prev) => ({ ...prev, [path]: null }));
    } catch {
      setReportsError((prev) => ({ ...prev, [path]: `Could not refresh ${path.replaceAll('-', ' ')}. Reload to try again.` }));
    }
  }
  const loadDiagnostics = () => loadReportList('diagnostics', setDiagnostics);
  const loadSurgicalReports = () => loadReportList('surgical-reports', setSurgicalReports);
  const loadDentalReports = () => loadReportList('dental-reports', setDentalReports);
  const loadUltrasoundReports = () => loadReportList('ultrasound-reports', setUltrasoundReports);
  const loadXrayReports = () => loadReportList('xray-reports', setXrayReports);

  useEffect(() => {
    loadDiagnostics();
    loadSurgicalReports();
    loadDentalReports();
    loadUltrasoundReports();
    loadXrayReports();

    const channel = supabase
      .channel(`hospitalization-reports-${hospitalizationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'diagnostics', filter: `hospitalization_id=eq.${hospitalizationId}` }, loadDiagnostics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'surgical_reports', filter: `hospitalization_id=eq.${hospitalizationId}` }, loadSurgicalReports)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dental_reports', filter: `hospitalization_id=eq.${hospitalizationId}` }, loadDentalReports)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ultrasound_reports', filter: `hospitalization_id=eq.${hospitalizationId}` }, loadUltrasoundReports)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'xray_reports', filter: `hospitalization_id=eq.${hospitalizationId}` }, loadXrayReports)
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitalizationId]);

  async function addDiagnostic(e) {
    e.preventDefault();
    if (!diagForm.goods_service_id) return;
    setDiagError(null);
    const res = await fetch('/api/diagnostics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalization_id: hospitalizationId, ...diagForm }),
    });
    const data = await res.json();
    if (!res.ok) {
      setDiagError(data.error || 'Failed to order test');
      return;
    }
    setDiagForm({ goods_service_id: '', description: '' });
    loadDiagnostics();
  }

  async function saveDiagnosticResult(diagId) {
    setSavingResultId(diagId);
    setResultError(null);
    try {
      const result = resultDrafts[diagId] ?? diagnostics.find((d) => d.id === diagId)?.result ?? '';
      const res = await fetch(`/api/diagnostics/${diagId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ result }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save result');
      setResultDrafts((prev) => { const next = { ...prev }; delete next[diagId]; return next; });
      await loadDiagnostics();
    } catch (err) {
      setResultError({ id: diagId, message: err.message });
    } finally {
      setSavingResultId(null);
    }
  }

  async function handleDiagnosticPhotoUploaded(diagId, testName, file, attachment) {
    setDiagPhotoVersion((prev) => ({ ...prev, [diagId]: (prev[diagId] || 0) + 1 }));
    if (isUltrasoundTest(testName) || isXrayTest(testName)) return;
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') return;
    setExtractingResultId(diagId);
    setExtractResultError((prev) => ({ ...prev, [diagId]: null }));
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('test_name', testName || '');
      const res = await fetch(`/api/diagnostics/${diagId}/extract-result`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setExtractResultError((prev) => ({ ...prev, [diagId]: data.error || 'Failed to read result from photo' }));
        return;
      }
      setResultDrafts((prev) => ({ ...prev, [diagId]: data.result }));
      loadDiagnostics();
    } catch (err) {
      setExtractResultError((prev) => ({ ...prev, [diagId]: err.message || 'Could not read the test result.' }));
    } finally {
      setExtractingResultId(null);
    }
  }

  async function addSurgicalReport(e) {
    e.preventDefault();
    await fetch('/api/surgical-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalization_id: hospitalizationId, ...surgForm }),
    });
    setSurgForm({ surgeon_id: '', procedure_name: '', notes: '' });
    loadSurgicalReports();
  }

  async function startDictateSurgicalReport() {
    setDictatingSurgical(true);
    const res = await fetch('/api/surgical-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalization_id: hospitalizationId }),
    });
    const data = await res.json();
    setDictatingSurgical(false);
    if (res.ok) {
      setAutoRecordSurgicalId(data.id);
      loadSurgicalReports();
    }
  }

  async function addDentalReport(e) {
    e.preventDefault();
    await fetch('/api/dental-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalization_id: hospitalizationId, ...dentalForm }),
    });
    setDentalForm({ performed_by: '', findings: '', procedures_performed: '', notes: '' });
    loadDentalReports();
  }

  async function startDictateDentalReport() {
    setDictatingDental(true);
    const res = await fetch('/api/dental-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalization_id: hospitalizationId }),
    });
    const data = await res.json();
    setDictatingDental(false);
    if (res.ok) {
      setAutoRecordDentalId(data.id);
      loadDentalReports();
    }
  }

  async function updateDentalChart(newChart) {
    const patientId = admission?.patients?.id;
    if (!patientId) return;
    setSavingDentalChart(true);
    const res = await fetch(`/api/patients/${patientId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dental_chart: newChart }),
    });
    const data = await res.json();
    setSavingDentalChart(false);
    if (res.ok) onPatientUpdated?.(data.dental_chart);
  }

  async function startDictateUltrasoundReport(diagnosticId) {
    setDictatingUltrasoundFor(diagnosticId);
    const res = await fetch('/api/ultrasound-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalization_id: hospitalizationId, diagnostic_id: diagnosticId }),
    });
    const data = await res.json();
    setDictatingUltrasoundFor(null);
    if (res.ok) {
      setAutoRecordUltrasoundId(data.id);
      loadUltrasoundReports();
    }
  }

  async function startDictateXrayReport(diagnosticId) {
    setDictatingXrayFor(diagnosticId);
    const res = await fetch('/api/xray-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalization_id: hospitalizationId, diagnostic_id: diagnosticId }),
    });
    const data = await res.json();
    setDictatingXrayFor(null);
    if (res.ok) {
      setAutoRecordXrayId(data.id);
      loadXrayReports();
    }
  }

  async function generateAiReport(apiBase, reportId, hasExisting, onDone) {
    if (hasExisting && !confirm('Regenerate this report? This will replace the current saved report text.')) return;
    setGenerateReportError(null);
    setGenerateReportErrorId(null);
    setGeneratingReportId(reportId);
    try {
      const res = await fetch(`${apiBase}/${reportId}/generate-report`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to generate report');
      await onDone();
    } catch (error) {
      setGenerateReportError(error.message || 'Failed to generate report');
      setGenerateReportErrorId(reportId);
    } finally {
      setGeneratingReportId(null);
    }
  }

  const vets = (staff || []).filter((s) => s.role === 'vet');
  const ultrasoundByDiagnostic = Object.fromEntries(ultrasoundReports.map((r) => [r.diagnostic_id, r]));
  const xrayByDiagnostic = Object.fromEntries(xrayReports.map((r) => [r.diagnostic_id, r]));

  return (
    <div className="hospitalization-reports-section">
      <h3>Order a test</h3>
      <form className="card" onSubmit={addDiagnostic}>
        {diagError && <p className="error">{diagError}</p>}
        <CatalogPicker
          catalog={catalog}
          subcategories={subcategories}
          value={diagForm.goods_service_id}
          onChange={(value) => setDiagForm({ ...diagForm, goods_service_id: value })}
          onItemCreated={onCatalogItemCreated}
          fixedMainCategory="test"
        />
        <input
          placeholder="Description (what was ordered — e.g. left front leg)"
          value={diagForm.description}
          onChange={(e) => setDiagForm({ ...diagForm, description: e.target.value })}
        />
        <button type="submit">Order test</button>
      </form>

      {diagnostics.map((d) => {
        const testName = catalog.find((c) => c.id === d.goods_service_id)?.name || LEGACY_DIAGNOSTIC_TYPE_LABELS[d.type] || d.type;
        if (isUltrasoundTest(testName)) {
          const report = ultrasoundByDiagnostic[d.id];
          return (
            <p key={d.id} className="visit-meta">
              🔊 {testName}:{' '}
              {report ? (
                'Report started — see Reports below'
              ) : (
                <button type="button" onClick={() => startDictateUltrasoundReport(d.id)} disabled={dictatingUltrasoundFor === d.id}>
                  🎤 {dictatingUltrasoundFor === d.id ? 'Starting...' : 'Dictate Ultrasound Report'}
                </button>
              )}
            </p>
          );
        }
        if (isXrayTest(testName)) {
          const report = xrayByDiagnostic[d.id];
          return (
            <p key={d.id} className="visit-meta">
              🩻 {testName}:{' '}
              {report ? (
                'Report started — see Reports below'
              ) : (
                <button type="button" onClick={() => startDictateXrayReport(d.id)} disabled={dictatingXrayFor === d.id}>
                  🎤 {dictatingXrayFor === d.id ? 'Starting...' : 'Dictate X-ray Report'}
                </button>
              )}
            </p>
          );
        }
        return null;
      })}

      <h3>Dental Reports</h3>
      <div className="card">
        <button type="button" onClick={startDictateDentalReport} disabled={dictatingDental}>
          🎤 {dictatingDental ? 'Starting...' : 'Dictate'}
        </button>
        {autoRecordDentalId && <AudioRecorder entityType="dental_report" entityId={autoRecordDentalId} autoStart />}
        <details>
          <summary>Or add manually</summary>
          <form className="form-grid" onSubmit={addDentalReport}>
            <select value={dentalForm.performed_by} onChange={(e) => setDentalForm({ ...dentalForm, performed_by: e.target.value })}>
              <option value="">Performed by...</option>
              {vets.map((v) => <option key={v.id} value={v.id}>{v.full_name}</option>)}
            </select>
            <input placeholder="Findings" value={dentalForm.findings} onChange={(e) => setDentalForm({ ...dentalForm, findings: e.target.value })} />
            <input placeholder="Procedures performed" value={dentalForm.procedures_performed} onChange={(e) => setDentalForm({ ...dentalForm, procedures_performed: e.target.value })} />
            <textarea rows={2} placeholder="Notes" value={dentalForm.notes} onChange={(e) => setDentalForm({ ...dentalForm, notes: e.target.value })} />
            <button type="submit">Add</button>
          </form>
        </details>
      </div>
      <DentalChart
        species={admission?.patients?.species}
        value={admission?.patients?.dental_chart}
        onChange={updateDentalChart}
        saving={savingDentalChart}
      />

      <h3>Surgical Reports</h3>
      <div className="card">
        <button type="button" onClick={startDictateSurgicalReport} disabled={dictatingSurgical}>
          🎤 {dictatingSurgical ? 'Starting...' : 'Dictate'}
        </button>
        {autoRecordSurgicalId && <AudioRecorder entityType="surgical_report" entityId={autoRecordSurgicalId} autoStart />}
        <details>
          <summary>Or add manually</summary>
          <form className="form-grid" onSubmit={addSurgicalReport}>
            <input placeholder="Procedure" value={surgForm.procedure_name} onChange={(e) => setSurgForm({ ...surgForm, procedure_name: e.target.value })} />
            <select value={surgForm.surgeon_id} onChange={(e) => setSurgForm({ ...surgForm, surgeon_id: e.target.value })}>
              <option value="">Surgeon...</option>
              {vets.map((v) => <option key={v.id} value={v.id}>{v.full_name}</option>)}
            </select>
            <textarea rows={2} placeholder="Notes" value={surgForm.notes} onChange={(e) => setSurgForm({ ...surgForm, notes: e.target.value })} />
            <button type="submit">Add</button>
          </form>
        </details>
      </div>

      {autoRecordUltrasoundId && (
        <div className="card">
          <p className="visit-meta">Ultrasound report — dictate now</p>
          <AudioRecorder entityType="ultrasound_report" entityId={autoRecordUltrasoundId} autoStart />
        </div>
      )}
      {autoRecordXrayId && (
        <div className="card">
          <p className="visit-meta">X-ray report — dictate now</p>
          <AudioRecorder entityType="xray_report" entityId={autoRecordXrayId} autoStart />
        </div>
      )}

      <RecordReports
        record={admission || {}} recordApiBase="/api/hospitalizations" showOverallReport={false}
        diagnostics={diagnostics} catalog={catalog}
        groups={[
          { label: 'Dental report', reports: dentalReports, apiBase: '/api/dental-reports', entityType: 'dental_report', reload: loadDentalReports },
          { label: 'Surgical report', reports: surgicalReports, apiBase: '/api/surgical-reports', entityType: 'surgical_report', reload: loadSurgicalReports },
          { label: 'Ultrasound report', reports: ultrasoundReports, apiBase: '/api/ultrasound-reports', entityType: 'ultrasound_report', reload: loadUltrasoundReports },
          { label: 'X-ray report', reports: xrayReports, apiBase: '/api/xray-reports', entityType: 'xray_report', reload: loadXrayReports },
        ]}
        onGenerate={generateAiReport} generatingId={generatingReportId}
        generationError={generateReportError} generationErrorId={generateReportErrorId}
        resultDrafts={resultDrafts} onResultChange={(diagId, text) => setResultDrafts((prev) => ({ ...prev, [diagId]: text }))}
        onSaveResult={saveDiagnosticResult} savingResultId={savingResultId} resultError={resultError}
        onUploaded={handleDiagnosticPhotoUploaded} extractingResultId={extractingResultId}
        extractResultError={extractResultError} attachmentVersions={diagPhotoVersion}
        reportsError={Object.values(reportsError).filter(Boolean).join(' ')}
      />
    </div>
  );
}
