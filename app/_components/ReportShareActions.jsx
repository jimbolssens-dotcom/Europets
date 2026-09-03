// app/_components/ReportShareActions.jsx
// Download/WhatsApp/email buttons for a surgical/dental report's PDF —
// the AI-drafted client report (see ClientReportEditor) plus, for
// dental, the chart. These just link straight to the report-pdf route,
// which always reads the last-saved ai_summary.

'use client';

export default function ReportShareActions({ apiBase, reportId, client, patient, reportLabel }) {
  function reportPdfUrl() {
    return `${window.location.origin}${apiBase}/${reportId}/report-pdf`;
  }

  function shareViaWhatsApp() {
    const phone = (client?.phone || '').replace(/\D/g, '');
    const message = `Hi ${client?.full_name || 'there'}, here is the ${reportLabel} for ${patient?.name || 'your pet'}: ${reportPdfUrl()}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  }

  function shareViaEmail() {
    const subject = `${patient?.name || 'Your pet'} — ${reportLabel}`;
    const body = `Hi ${client?.full_name || 'there'},\n\nHere is the ${reportLabel} for ${patient?.name || 'your pet'}: ${reportPdfUrl()}\n\nPlease don't hesitate to reach out if you have any questions.`;
    window.open(`mailto:${client?.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
  }

  return (
    <div className="share-actions">
      <a className="share-btn" href={`${apiBase}/${reportId}/report-pdf`} target="_blank" rel="noreferrer">
        📄 Download PDF
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
