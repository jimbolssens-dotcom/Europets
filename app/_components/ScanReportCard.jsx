// app/_components/ScanReportCard.jsx
// The one report card for an ultrasound, x-ray or gastroscopy (Jim, 19 Nov:
// "one scan, one report card, the same everywhere"). The same four things
// wherever the scan was logged, consult, day procedure or hospital stay:
//   🎤 Dictate, ✍️ Findings (type or edit any time), ✨ Generate report,
//   and the Owner / Vet share.
// The report itself comes with the scan test (migration 256), so there is
// no separate "start a report" step. Used by the consult's Tests column
// and by every Reports section (RecordReports).

'use client';

import { useEffect, useState } from 'react';
import AudioRecorder from './AudioRecorder';
import AttachmentSection from './AttachmentSection';
import ClientReportEditor from './ClientReportEditor';
import ReportShareActions from './ReportShareActions';
import VoiceToTextButton from './VoiceToTextButton';
import { SCAN_KINDS, scanReportAnchor } from '@/lib/scanReports';
import { formatShortDate } from '@/lib/formatTimestamp';

// tests: the scan's test lines on this case ({ id, name }), e.g. "X-ray
// first" and "X-ray second". Their images live on the test line (where
// x-rays have always been uploaded and are compressed), so they show here.
export default function ScanReportCard({ kind, report, record, staff = [], onChanged, onDelete, open = false, tests = [] }) {
  const meta = SCAN_KINDS[kind];
  const [draft, setDraft] = useState(report.findings || '');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [files, setFiles] = useState({});
  const fileCount = Object.values(files).reduce((n, c) => n + (c || 0), 0);
  const countFiles = (key) => (c) => setFiles((prev) => (prev[key] === c ? prev : { ...prev, [key]: c }));
  const dirty = (draft || '') !== (report.findings || '');

  // A dictation or another screen can change the report underneath; keep
  // the box in step unless something is being typed into it.
  useEffect(() => {
    if (!dirty) setDraft(report.findings || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.findings]);

  async function patch(body) {
    const res = await fetch(`${meta.apiBase}/${report.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not save.');
    return data;
  }

  async function saveFindings() {
    setSaving(true);
    setError(null);
    try {
      await patch({ findings: draft });
      await onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    if (report.ai_summary && !confirm('Write the report again? This replaces the current report text.')) return;
    setGenerating(true);
    setError(null);
    try {
      if (dirty) await patch({ findings: draft });
      const res = await fetch(`${meta.apiBase}/${report.id}/generate-report`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not write the report.');
      await onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function assign(staffId) {
    setError(null);
    try {
      await patch({ performed_by: staffId || null });
      await onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <details className="card scan-report-card" id={scanReportAnchor(kind, report.id)} open={open || undefined}>
      <summary>
        {meta.icon} <strong>{meta.label} report</strong>
        <span className={`scan-report-status${report.ai_summary ? ' done' : ''}`}>{report.ai_summary ? 'Written' : 'Not written yet'}</span>
        <span className="visit-meta">
          {report.performed_at ? formatShortDate(report.performed_at) : ''}
          {tests.length > 1 && ` · ${tests.map((t) => t.name).join(' + ')}`}
          {fileCount > 0 && ` · 📎 ${fileCount}`}
        </span>
      </summary>

      <div className="scan-report-step">
        <span className="scan-report-step-label">
          🎤 Dictate
          <label className="visit-meta scan-report-by">
            By{' '}
            <select value={report.performed_by || ''} onChange={(e) => assign(e.target.value)}>
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
          </label>
        </span>
        <AudioRecorder entityType={meta.entityType} entityId={report.id} onRefresh={onChanged} />
      </div>

      <label className="scan-report-step">
        <span className="field-label-row scan-report-step-label">
          ✍️ Findings
          <VoiceToTextButton kind="test_result" onResult={(text) => setDraft((d) => (d ? `${d}\n${text}` : text))} />
        </span>
        <textarea rows={4} value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder="Type the findings here, or dictate above. Both go into the report." />
      </label>
      {report.notes && <p className="visit-meta" style={{ whiteSpace: 'pre-wrap' }}>Notes: {report.notes}</p>}

      <div className="home-links scan-report-actions">
        {dirty && (
          <button type="button" className="secondary" onClick={saveFindings} disabled={saving || generating}>
            {saving ? 'Saving…' : 'Save findings'}
          </button>
        )}
        <button type="button" onClick={generate} disabled={generating || saving}>
          {generating ? 'Writing…' : report.ai_summary ? '✨ Generate again' : '✨ Generate report'}
        </button>
        {onDelete && (
          <button type="button" className="secondary" onClick={() => onDelete(report)}>Delete report</button>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {report.ai_summary && (
        <ClientReportEditor reportId={report.id} apiBase={meta.apiBase} savedReport={report.ai_summary} onSaved={onChanged} title="Clinical Report" />
      )}
      {report.client_summary && (
        <ClientReportEditor reportId={report.id} apiBase={meta.apiBase} savedReport={report.client_summary} onSaved={onChanged}
          field="client_summary" title="Client Summary" />
      )}
      {report.ai_summary && (
        <ReportShareActions reportId={report.id} apiBase={meta.apiBase} client={record?.clients} patient={record?.patients}
          reportLabel={`${meta.label.toLowerCase()} report`} versions={!!report.client_summary} />
      )}

      <div className="scan-report-step">
        <span className="scan-report-step-label">📷 Images</span>
        {tests.map((t) => (
          <div key={t.id}>
            {tests.length > 1 && <span className="visit-meta">{t.name}</span>}
            <AttachmentSection entityType="diagnostic" entityId={t.id} onAttachmentsChange={countFiles(t.id)} />
          </div>
        ))}
        {/* The report's own files: the place to add images when the scan has
            no test line (a report started on its own), else only shown once
            something is there. */}
        <div hidden={tests.length > 0 && !files.report}>
          <AttachmentSection entityType={meta.entityType} entityId={report.id} onAttachmentsChange={countFiles('report')} />
        </div>
      </div>
    </details>
  );
}
