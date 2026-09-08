// app/_components/ReportShareActions.jsx
// Download/WhatsApp/email buttons for a surgical/dental report's PDF —
// the AI-drafted client report (see ClientReportEditor) plus, for
// dental, the chart. These just link straight to the report-pdf route,
// which always reads the last-saved ai_summary. `pdfPath` defaults to the
// usual `report-pdf` route name but can point at a different PDF route
// under the same `apiBase/reportId` (e.g. the consult's test-report-pdf).

'use client';

import { openWhatsApp } from '@/lib/whatsapp';

export default function ReportShareActions({ apiBase, reportId, client, patient, reportLabel, pdfPath = 'report-pdf' }) {
  function reportPdfUrl() {
    return `${window.location.origin}${apiBase}/${reportId}/${pdfPath}`;
  }

  function shareViaWhatsApp() {
    const message = `Hi ${client?.full_name || 'there'}, here is the ${reportLabel} for ${patient?.name || 'your pet'}: ${reportPdfUrl()}`;
    openWhatsApp(client?.phone, message);
  }

  function shareViaEmail() {
    const subject = `${patient?.name || 'Your pet'} — ${reportLabel}`;
    const body = `Hi ${client?.full_name || 'there'},\n\nHere is the ${reportLabel} for ${patient?.name || 'your pet'}: ${reportPdfUrl()}\n\nPlease don't hesitate to reach out if you have any questions.`;
    window.open(`mailto:${client?.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
  }

  return (
    <div className="share-actions">
      <a className="share-btn" href={`${apiBase}/${reportId}/${pdfPath}`} target="_blank" rel="noreferrer">
        📄 Download
      </a>
      <button type="button" className="share-btn" onClick={shareViaWhatsApp} disabled={!client?.phone}>
        💬 WhatsApp
      </button>
      <button type="button" className="share-btn" onClick={shareViaEmail} disabled={!client?.email}>
        ✉️ Email
      </button>
    </div>
  );
}
