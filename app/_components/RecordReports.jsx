// app/_components/RecordReports.jsx
// The "Reports" working panel — generate/edit/share AI client reports and
// review test results — shared by the consult page (a visit) and the
// hospitalization page (an admission). `record` is whichever one this is
// for; `recordApiBase` ('/api/visits' or '/api/hospitalizations') is
// where its own overall report and combined test-results PDF live.
// `showOverallReport` is only true for a consult — hospitalizations have
// no whole-stay AI narrative of their own, just the individual
// procedure/test reports below.

'use client';

import ClientReportEditor from './ClientReportEditor';
import ReportShareActions from './ReportShareActions';
import AttachmentSection from './AttachmentSection';
import { useState } from 'react';
import { isImagingDiagnostic } from '@/lib/diagnosticReportPolicy';

export default function RecordReports({ record, recordApiBase, showOverallReport, diagnostics, catalog, groups, onRecordSaved,
  onGenerate, generatingId, generationError, generationErrorId,
  resultDrafts, onResultChange, onSaveResult, savingResultId, resultError,
  onUploaded, extractingResultId, extractResultError, attachmentVersions, onOpenSource,
  onGenerateOverallReport, onDeleteOverallReport, onDeleteDiagnostic,
  overallReportLabel = 'consult report', overallReportPdfPath = 'report-pdf', reportsError }) {
  const [summaries, setSummaries] = useState({});
  const [summarizing, setSummarizing] = useState({});
  const [summaryErrors, setSummaryErrors] = useState({});
  const [deletingId, setDeletingId] = useState(null);

  async function deleteGroupReport(group, report) {
    if (!confirm('Delete this report? This cannot be undone.')) return;
    setDeletingId(report.id);
    await fetch(`${group.apiBase}/${report.id}`, { method: 'DELETE' });
    setDeletingId(null);
    group.reload();
  }
  async function summarize(diagnostic) {
    setSummarizing((prev) => ({ ...prev, [diagnostic.id]: true }));
    setSummaryErrors((prev) => ({ ...prev, [diagnostic.id]: null }));
    try {
      const response = await fetch(`/api/diagnostics/${diagnostic.id}/summarize-result`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not summarize results.');
      setSummaries((prev) => ({ ...prev, [diagnostic.id]: { text: data.summary, source: diagnostic.result } }));
    } catch (error) {
      setSummaryErrors((prev) => ({ ...prev, [diagnostic.id]: error.message }));
    } finally {
      setSummarizing((prev) => ({ ...prev, [diagnostic.id]: false }));
    }
  }
  const count = diagnostics.length + groups.reduce((n, group) => n + group.reports.length, 0);
  return <section className="consult-reports" aria-label="Reports">
    <h3>Reports</h3>
    <p className="visit-meta">Reports and test results for this record. Review and save changes before sharing.</p>
    {reportsError && <p className="error" role="alert">{reportsError}</p>}
    {showOverallReport && <section className="card" aria-label={overallReportLabel}>
      <h4>{overallReportLabel[0].toUpperCase()}{overallReportLabel.slice(1)}</h4>
      <p className="visit-meta">Summary of the saved notes and reports. Regenerate after adding or changing results.</p>
      {onGenerateOverallReport && <button type="button" disabled={generatingId === record.id} onClick={onGenerateOverallReport}>
        {generatingId === record.id ? 'Generating…' : record.ai_summary ? `Regenerate ${overallReportLabel}` : `Generate ${overallReportLabel}`}
      </button>}
      {onDeleteOverallReport && record.ai_summary && <button type="button" disabled={deletingId === record.id}
        onClick={async () => { if (!confirm(`Delete this ${overallReportLabel}? This cannot be undone.`)) return; setDeletingId(record.id); await onDeleteOverallReport(); setDeletingId(null); }}>
        {deletingId === record.id ? 'Deleting…' : `Delete ${overallReportLabel}`}
      </button>}
      {generationErrorId === record.id && <p className="error" role="alert">{generationError}</p>}
      {record.ai_summary ? <ClientReportEditor reportId={record.id} apiBase={recordApiBase}
        savedReport={record.ai_summary} onSaved={onRecordSaved} /> : <p>No {overallReportLabel} generated yet.</p>}
      <ReportShareActions reportId={record.id} apiBase={recordApiBase} pdfPath={overallReportPdfPath} client={record.clients}
        patient={record.patients} reportLabel={overallReportLabel} />
    </section>}
    {!count && !reportsError && <p>No procedure reports or test results added yet.</p>}
    {groups.map((group) => group.reports.length > 0 && <section key={group.apiBase} id={group.anchorId} aria-label={group.label}>
      <h4>{group.label}</h4>
      {group.reports.map((report) => <details className="card" key={report.id}>
        <summary>{report.procedure_name || group.label} · {report.performed_at ? new Date(report.performed_at).toLocaleString() : 'Date not recorded'} · {report.ai_summary ? 'Report available' : 'Report pending'}</summary>
        <p className="visit-meta">{report.staff?.full_name || 'Unassigned'}</p>
        {!report.ai_summary && <p style={{ whiteSpace: 'pre-wrap' }}>{[report.findings, report.procedures_performed, report.notes].filter(Boolean).join('\n') || 'Awaiting findings or dictation.'}</p>}
        <div className="home-links">
          {onOpenSource && group.sourceTab && <button type="button" onClick={() => onOpenSource(group.sourceTab)}>Open source notes</button>}
          <button type="button" onClick={() => onGenerate(group.apiBase, report.id, !!report.ai_summary, group.reload)}
            disabled={generatingId === report.id || !(report.findings || report.procedures_performed || report.procedure_name || report.notes)}>
            {generatingId === report.id ? 'Generating…' : report.ai_summary ? 'Regenerate report' : 'Generate report'}
          </button>
          <button type="button" onClick={() => deleteGroupReport(group, report)} disabled={deletingId === report.id}>
            {deletingId === report.id ? 'Deleting…' : 'Delete report'}
          </button>
        </div>
        {generationErrorId === report.id && <p className="error" role="alert">{generationError}</p>}
        {report.ai_summary && <ClientReportEditor reportId={report.id} apiBase={group.apiBase} savedReport={report.ai_summary} onSaved={group.reload} />}
        <ReportShareActions reportId={report.id} apiBase={group.apiBase} client={record.clients} patient={record.patients} reportLabel={group.label.toLowerCase()} />
        <AttachmentSection entityType={group.entityType} entityId={report.id} />
      </details>)}
    </section>)}
    {(diagnostics.length > 0 || record.test_results) && <section id="report-test-results" aria-label="Test results">
      <h4>Test results and blood reports</h4>
      <ReportShareActions reportId={record.id} apiBase={recordApiBase} pdfPath="test-report-pdf"
        client={record.clients} patient={record.patients} reportLabel="test results" />
      {record.test_results && <details className="card"><summary>Consult test notes</summary>
        <p style={{ whiteSpace: 'pre-wrap' }}>{record.test_results}</p>
        {onOpenSource && <button type="button" onClick={() => onOpenSource('exam')}>Edit in Exam &amp; Notes</button>}
      </details>}
      {diagnostics.map((diagnostic) => {
        const name = catalog.find((item) => item.id === diagnostic.goods_service_id)?.name || diagnostic.type?.replaceAll('_', ' ') || 'Test';
        return <details className="card" key={diagnostic.id}>
          <summary>{name} · {diagnostic.result ? 'Result recorded' : 'Awaiting result'}</summary>
          {diagnostic.description && <p>{diagnostic.description}</p>}
          <label className="report-result-field">Results
            <textarea rows={8} value={resultDrafts[diagnostic.id] ?? diagnostic.result ?? ''}
              onChange={(event) => onResultChange(diagnostic.id, event.target.value)} />
          </label>
          <button type="button" onClick={() => onSaveResult(diagnostic.id)} disabled={savingResultId === diagnostic.id}>
            {savingResultId === diagnostic.id ? 'Saving…' : 'Save results'}
          </button>
          {onDeleteDiagnostic && <button type="button" disabled={deletingId === diagnostic.id}
            onClick={async () => { if (!confirm('Delete this test and its result? This cannot be undone.')) return; setDeletingId(diagnostic.id); await onDeleteDiagnostic(diagnostic.id); setDeletingId(null); }}>
            {deletingId === diagnostic.id ? 'Deleting…' : 'Delete'}
          </button>}
          {resultError?.id === diagnostic.id && <p className="error" role="alert">{resultError.message}</p>}
          {!isImagingDiagnostic(diagnostic, name) && <>
            <p className="visit-meta">Save pasted laboratory results first, then create a factual list of abnormalities. No clinical interpretation is added.</p>
            <button type="button" onClick={() => summarize(diagnostic)}
              disabled={summarizing[diagnostic.id] || !diagnostic.result || (resultDrafts[diagnostic.id] !== undefined && resultDrafts[diagnostic.id] !== diagnostic.result)}>
              {summarizing[diagnostic.id] ? 'Summarizing…' : 'Summarize abnormalities'}
            </button>
            {summaryErrors[diagnostic.id] && <p className="error" role="alert">{summaryErrors[diagnostic.id]}</p>}
            {summaries[diagnostic.id] && <div>
              <p style={{ whiteSpace: 'pre-wrap' }}>{summaries[diagnostic.id].text}</p>
              <button type="button" disabled={summaries[diagnostic.id].source !== (resultDrafts[diagnostic.id] ?? diagnostic.result)}
                onClick={() => {
                  onResultChange(diagnostic.id, diagnostic.result + '\n\n' + summaries[diagnostic.id].text);
                  setSummaries((prev) => ({ ...prev, [diagnostic.id]: null }));
                }}>Add to results for review</button>
            </div>}
          </>}
          {extractingResultId === diagnostic.id && <p role="status">Reading test results…</p>}
          {extractResultError[diagnostic.id] && <p className="error" role="alert">{extractResultError[diagnostic.id]}</p>}
          <AttachmentSection entityType="diagnostic" entityId={diagnostic.id} refreshKey={attachmentVersions[diagnostic.id]}
            onUploaded={(file, attachment) => onUploaded(diagnostic.id, name, file, attachment)} />
        </details>;
      })}
    </section>}
  </section>;
}
