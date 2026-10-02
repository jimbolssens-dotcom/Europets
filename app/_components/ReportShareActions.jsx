// app/_components/ReportShareActions.jsx
// Download/WhatsApp/email buttons for a surgical/dental report's PDF —
// the AI-drafted client report (see ClientReportEditor) plus, for
// dental, the chart. These just link straight to the report-pdf route,
// which always reads the last-saved ai_summary. `pdfPath` defaults to the
// usual `report-pdf` route name but can point at a different PDF route
// under the same `apiBase/reportId` (e.g. the consult's test-report-pdf).

'use client';

import { useState } from 'react';
import { openWhatsApp } from '@/lib/whatsapp';

export default function ReportShareActions({ apiBase, reportId, client, patient, reportLabel, pdfPath = 'report-pdf' }) {
  const [emailState, setEmailState] = useState('idle'); // 'idle' | 'sending' | 'sent' | 'error'
  const [emailError, setEmailError] = useState(null);

  function reportPdfUrl() {
    return `${window.location.origin}${apiBase}/${reportId}/${pdfPath}`;
  }

  function clientLabel() {
    return `${client?.full_name || 'there'}${client?.client_number ? ` (Client #${client.client_number})` : ''}`;
  }

  function patientLabel() {
    return `${patient?.name || 'your pet'}${patient?.patient_number ? ` (Patient #${patient.patient_number})` : ''}`;
  }

  function shareViaWhatsApp() {
    const message = `Hi ${clientLabel()}, here is the ${reportLabel} for ${patientLabel()}: ${reportPdfUrl()}`;
    openWhatsApp(client?.phone, message);
  }

  async function shareViaEmail() {
    if (!client?.id) return;
    setEmailState('sending');
    setEmailError(null);
    const subject = `${patientLabel()} — ${reportLabel}`;
    const text = `Hi ${clientLabel()},\n\nHere is the ${reportLabel} for ${patientLabel()}: ${reportPdfUrl()}\n\nPlease don't hesitate to reach out if you have any questions.`;
    try {
      const res = await fetch(`/api/clients/${client.id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      setEmailState('sent');
    } catch (err) {
      setEmailState('error');
      setEmailError(err.message);
    }
  }

  return (
    <div className="share-actions">
      <a className="share-btn" href={`${apiBase}/${reportId}/${pdfPath}`} target="_blank" rel="noreferrer">
        📄 Download
      </a>
      <button type="button" className="share-btn" onClick={shareViaWhatsApp} disabled={!client?.phone}>
        💬 WhatsApp
      </button>
      <button type="button" className="share-btn" onClick={shareViaEmail} disabled={!client?.email || emailState === 'sending'}>
        {emailState === 'sending' ? 'Sending...' : emailState === 'sent' ? '✅ Sent' : '✉️ Email'}
      </button>
      {emailState === 'error' && <span className="error">{emailError}</span>}
    </div>
  );
}
