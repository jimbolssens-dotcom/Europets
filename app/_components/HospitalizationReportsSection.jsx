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

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import AttachmentSection from './AttachmentSection';
import AudioRecorder from './AudioRecorder';
import CatalogPicker from './CatalogPicker';
import DentalChart from './DentalChart';
import RecordReports from './RecordReports';
import { isUltrasoundTest } from '@/lib/ultrasoundProduct';
import { isXrayTest } from '@/lib/xrayProduct';
import { isBloodTest } from '@/lib/bloodTestProduct';
import { ensureSurgicalReport } from '@/lib/surgicalReportAuto';
import { resolveCaseScope, loadCaseReports } from '@/lib/caseReportScope';

const LEGACY_DIAGNOSTIC_TYPE_LABELS = {
  blood: 'Blood test',
  pcr: 'PCR',
  blood_test: 'Blood test',
  xray: 'X-ray',
  ultrasound: 'Ultrasound',
  other: 'Other',
};

const HospitalizationReportsSection = forwardRef(function HospitalizationReportsSection(
  { hospitalizationId, admission, staff, catalog, subcategories, onCatalogItemCreated, onPatientUpdated, onAdmissionUpdated },
  ref
) {
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
  const [startingSurgicalPhoto, setStartingSurgicalPhoto] = useState(false);
  const [photoRecordSurgicalId, setPhotoRecordSurgicalId] = useState(null);

  const [dentalReports, setDentalReports] = useState([]);
  const [dentalForm, setDentalForm] = useState({ performed_by: '', findings: '', procedures_performed: '', notes: '' });
  const [dictatingDental, setDictatingDental] = useState(false);
  const [autoRecordDentalId, setAutoRecordDentalId] = useState(null);
  const [startingDentalPhoto, setStartingDentalPhoto] = useState(false);
  const [photoRecordDentalId, setPhotoRecordDentalId] = useState(null);
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

  // The "Order a test or start a report" section is a collapsed <details>
  // by default — fine when staff open it themselves, but the checklist's
  // "Open Dental/Surgical Report" button (openOrStartDentalReport/
  // openOrStartSurgicalReport below) needs its AudioRecorder actually
  // visible, not mounted invisibly inside a closed disclosure (which
  // looked, on desktop, like the dictate/type controls simply weren't
  // there at all).
  const startReportDetailsRef = useRef(null);
  useEffect(() => {
    if (
      !autoRecordDentalId && !autoRecordSurgicalId && !autoRecordUltrasoundId && !autoRecordXrayId &&
      !photoRecordDentalId && !photoRecordSurgicalId
    ) return;
    const el = startReportDetailsRef.current;
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [autoRecordDentalId, autoRecordSurgicalId, autoRecordUltrasoundId, autoRecordXrayId, photoRecordDentalId, photoRecordSurgicalId]);

  // A "case" can be more than just this one hospitalizations row — the
  // consult it started from (originating_visit_id), and/or a parallel
  // admission/day-procedure it's linked to (originating_hospitalization_id,
  // see migration 090) — see lib/caseReportScope.js. Every report type
  // below is loaded across that whole family and merged into one list, not
  // just this row's own hospitalization_id, so nothing dictated on a linked
  // record goes missing here. Read-only merge — a report still only ever
  // gets written to whichever single record it was actually created on.
  const [caseScope, setCaseScope] = useState(() => ({ hospitalizationIds: [hospitalizationId], visitIds: [] }));

  useEffect(() => {
    let cancelled = false;
    resolveCaseScope(admission || { id: hospitalizationId }).then((scope) => {
      if (!cancelled) setCaseScope(scope);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitalizationId, admission?.originating_visit_id, admission?.originating_hospitalization_id]);

  async function loadReportList(path, setter) {
    try {
      setter(await loadCaseReports(path, caseScope));
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

  const scopeKey = `${caseScope.hospitalizationIds.join(',')}|${caseScope.visitIds.join(',')}`;

  useEffect(() => {
    loadDiagnostics();
    loadSurgicalReports();
    loadDentalReports();
    loadUltrasoundReports();
    loadXrayReports();

    let channel = supabase.channel(`hospitalization-reports-${hospitalizationId}`);
    const tableLoaders = [
      ['diagnostics', loadDiagnostics],
      ['surgical_reports', loadSurgicalReports],
      ['dental_reports', loadDentalReports],
      ['ultrasound_reports', loadUltrasoundReports],
      ['xray_reports', loadXrayReports],
    ];
    for (const [table, reload] of tableLoaders) {
      for (const id of caseScope.hospitalizationIds) {
        channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `hospitalization_id=eq.${id}` }, reload);
      }
      for (const id of caseScope.visitIds) {
        channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `visit_id=eq.${id}` }, reload);
      }
    }
    channel.subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

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
    if (isUltrasoundTest(testName) || isXrayTest(testName) || isBloodTest(testName)) return;
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

  // Resumes whichever surgical report already exists for this admission
  // (a dictation/photo already in progress this session, or one started
  // earlier — from the mobile app, say) instead of creating a sibling
  // every time this is clicked. Splitting dictation and photos across two
  // separate report rows was the actual bug behind "photos from the
  // mobile app aren't in the report": whichever row never got the
  // findings dictated into it is also never the one that gets generated
  // and shared, so its photos never reach the owner. A genuinely separate
  // second procedure still gets a fresh row via "Or add manually" below.
  async function startDictateSurgicalReport() {
    if (photoRecordSurgicalId && !autoRecordSurgicalId) {
      setAutoRecordSurgicalId(photoRecordSurgicalId);
      return;
    }
    const existing = surgicalReports[surgicalReports.length - 1];
    if (existing) {
      setAutoRecordSurgicalId(existing.id);
      return;
    }
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
      setPhotoRecordSurgicalId(null);
      loadSurgicalReports();
    }
  }

  // Lets a photo be attached before dictation even starts — see
  // startDictateSurgicalReport's comment for why this resumes an
  // existing report rather than creating a new one each time.
  async function startPhotoSurgicalReport() {
    if (autoRecordSurgicalId) {
      setPhotoRecordSurgicalId(autoRecordSurgicalId);
      return;
    }
    if (photoRecordSurgicalId) return;
    const existing = surgicalReports[surgicalReports.length - 1];
    if (existing) {
      setPhotoRecordSurgicalId(existing.id);
      return;
    }
    setStartingSurgicalPhoto(true);
    const res = await fetch('/api/surgical-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalization_id: hospitalizationId }),
    });
    const data = await res.json();
    setStartingSurgicalPhoto(false);
    if (res.ok) {
      setPhotoRecordSurgicalId(data.id);
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

  // See startDictateSurgicalReport's comment — resumes the existing
  // dental report (this session's, or an earlier one from the mobile
  // app) instead of starting a sibling that would split its findings and
  // photos away from whichever report actually gets shared.
  async function startDictateDentalReport() {
    if (photoRecordDentalId && !autoRecordDentalId) {
      setAutoRecordDentalId(photoRecordDentalId);
      return;
    }
    const existing = dentalReports[dentalReports.length - 1];
    if (existing) {
      setAutoRecordDentalId(existing.id);
      return;
    }
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
      setPhotoRecordDentalId(null);
      loadDentalReports();
    }
  }

  // Lets a photo be attached before dictation even starts — see
  // startDictateDentalReport's comment for why this resumes an existing
  // report rather than creating a new one each time.
  async function startPhotoDentalReport() {
    if (autoRecordDentalId) {
      setPhotoRecordDentalId(autoRecordDentalId);
      return;
    }
    if (photoRecordDentalId) return;
    const existing = dentalReports[dentalReports.length - 1];
    if (existing) {
      setPhotoRecordDentalId(existing.id);
      return;
    }
    setStartingDentalPhoto(true);
    const res = await fetch('/api/dental-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalization_id: hospitalizationId }),
    });
    const data = await res.json();
    setStartingDentalPhoto(false);
    if (res.ok) {
      setPhotoRecordDentalId(data.id);
      loadDentalReports();
    }
  }

  // Triggered externally (the Procedure Checklist's "Open Dental/Surgical
  // Report" button, a sibling component — see the ref passed down from the
  // hospitalization page) so tapping a checklist item lands staff straight
  // in a ready-to-dictate report, the same way the mobile checklist
  // navigates to one, instead of a scroll to an empty section. Same
  // resume-the-existing-one behavior as the plain "Dictate"/"Photo"
  // buttons below now use.
  useImperativeHandle(ref, () => ({
    openOrStartDentalReport() {
      const existing = dentalReports[dentalReports.length - 1];
      if (existing) {
        setAutoRecordDentalId(existing.id);
        return;
      }
      startDictateDentalReport();
    },
    async openOrStartSurgicalReport(procedureName, isSpayNeuter) {
      const report = await ensureSurgicalReport({ hospitalizationId, procedureName: procedureName || null, isSpayNeuter: !!isSpayNeuter });
      setAutoRecordSurgicalId(report.id);
      loadSurgicalReports();
    },
    // A checklist/plan item classified as a plain test (blood panel, PCR,
    // fecal, urine, ...) never gets its own diagnostics row just from
    // being added to a checklist — unlike dental/surgical, ticking it
    // done only logs a worksheet note. This finds the matching one (by
    // catalog item, same as the mobile checklist's own find-or-create) or
    // creates it, so "Enter Test Result" always lands on a real row with
    // a result field and photo/file upload, not an empty section.
    async openOrStartTestResult(goodsServiceId) {
      const existing = diagnostics.find((d) => d.goods_service_id === goodsServiceId);
      if (existing) return existing;
      const res = await fetch('/api/diagnostics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalization_id: hospitalizationId, goods_service_id: goodsServiceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start the test');
      await loadDiagnostics();
      return data;
    },
  }));

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

  async function deleteDiagnostic(diagId) {
    await fetch(`/api/diagnostics/${diagId}`, { method: 'DELETE' });
    loadDiagnostics();
  }

  async function deleteHospitalReport() {
    await fetch(`/api/hospitalizations/${hospitalizationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai_summary: null }),
    });
    onAdmissionUpdated?.();
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
      <RecordReports
        record={admission || {}} recordApiBase="/api/hospitalizations" showOverallReport
        overallReportLabel={admission?.kind === 'day_procedure' ? 'day procedure report' : 'hospital report'} overallReportPdfPath="summary-pdf"
        onRecordSaved={onAdmissionUpdated}
        onGenerateOverallReport={() => generateAiReport('/api/hospitalizations', hospitalizationId, !!admission?.ai_summary, onAdmissionUpdated)}
        onDeleteOverallReport={deleteHospitalReport} onDeleteDiagnostic={deleteDiagnostic}
        diagnostics={diagnostics} catalog={catalog}
        groups={[
          { label: 'Dental report', reports: dentalReports, apiBase: '/api/dental-reports', entityType: 'dental_report', anchorId: 'report-dental', reload: loadDentalReports },
          { label: 'Surgical report', reports: surgicalReports, apiBase: '/api/surgical-reports', entityType: 'surgical_report', anchorId: 'report-surgical', reload: loadSurgicalReports },
          { label: 'Ultrasound report', reports: ultrasoundReports, apiBase: '/api/ultrasound-reports', entityType: 'ultrasound_report', anchorId: 'report-ultrasound', reload: loadUltrasoundReports, hasClientSummary: true },
          { label: 'X-ray report', reports: xrayReports, apiBase: '/api/xray-reports', entityType: 'xray_report', anchorId: 'report-xray', reload: loadXrayReports, hasClientSummary: true },
        ]}
        onGenerate={generateAiReport} generatingId={generatingReportId}
        generationError={generateReportError} generationErrorId={generateReportErrorId}
        resultDrafts={resultDrafts} onResultChange={(diagId, text) => setResultDrafts((prev) => ({ ...prev, [diagId]: text }))}
        onSaveResult={saveDiagnosticResult} savingResultId={savingResultId} resultError={resultError}
        onUploaded={handleDiagnosticPhotoUploaded} extractingResultId={extractingResultId}
        extractResultError={extractResultError} attachmentVersions={diagPhotoVersion}
        reportsError={Object.values(reportsError).filter(Boolean).join(' ')}
      />

      <details className="card" ref={startReportDetailsRef}>
        <summary>➕ Order a test or start a report</summary>

        <h4>Order a test</h4>
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
                  'Report started — see Reports above'
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
                  'Report started — see Reports above'
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

        <h4>Dental Reports</h4>
        <div className="card">
          {/* Once a report's actually showing below, these have done their
              job (open/resume it) — leaving them up reads as a second,
              redundant "start recording"/"add a photo" control sitting
              right above the real ones. */}
          {!autoRecordDentalId && !photoRecordDentalId && (
            <div className="home-links">
              <button type="button" onClick={startDictateDentalReport} disabled={dictatingDental}>
                🎤 {dictatingDental ? 'Starting...' : 'Dictate'}
              </button>
              <button type="button" onClick={startPhotoDentalReport} disabled={startingDentalPhoto}>
                📷 {startingDentalPhoto ? 'Starting...' : 'Photo'}
              </button>
            </div>
          )}
          {autoRecordDentalId && (
            <AudioRecorder entityType="dental_report" entityId={autoRecordDentalId} onRefresh={loadDentalReports} />
          )}
          {(photoRecordDentalId || autoRecordDentalId) && (
            <AttachmentSection entityType="dental_report" entityId={photoRecordDentalId || autoRecordDentalId} />
          )}
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

        <h4>Surgical Reports</h4>
        <div className="card">
          {!autoRecordSurgicalId && !photoRecordSurgicalId && (
            <div className="home-links">
              <button type="button" onClick={startDictateSurgicalReport} disabled={dictatingSurgical}>
                🎤 {dictatingSurgical ? 'Starting...' : 'Dictate'}
              </button>
              <button type="button" onClick={startPhotoSurgicalReport} disabled={startingSurgicalPhoto}>
                📷 {startingSurgicalPhoto ? 'Starting...' : 'Photo'}
              </button>
            </div>
          )}
          {autoRecordSurgicalId && (
            <AudioRecorder entityType="surgical_report" entityId={autoRecordSurgicalId} onRefresh={loadSurgicalReports} />
          )}
          {(photoRecordSurgicalId || autoRecordSurgicalId) && (
            <AttachmentSection entityType="surgical_report" entityId={photoRecordSurgicalId || autoRecordSurgicalId} />
          )}
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
            <AudioRecorder entityType="ultrasound_report" entityId={autoRecordUltrasoundId} onRefresh={loadUltrasoundReports} />
          </div>
        )}
        {autoRecordXrayId && (
          <div className="card">
            <p className="visit-meta">X-ray report — dictate now</p>
            <AudioRecorder entityType="xray_report" entityId={autoRecordXrayId} onRefresh={loadXrayReports} />
          </div>
        )}
      </details>
    </div>
  );
});

export default HospitalizationReportsSection;
