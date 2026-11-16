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
import { appOrigin } from '@/lib/appOrigin';

// versions: a scan report with both a client summary and a clinical report
// (ultrasound, X-ray, gastroscopy). A For: Owner | Vet switch picks which
// one the buttons download and send; the clinical one is for another
// clinic, so its WhatsApp opens without a preset number (Jim, 16 Nov).
export default function ReportShareActions({ apiBase, reportId, client, patient, reportLabel, pdfPath = 'report-pdf', versions = false }) {
  const [emailState, setEmailState] = useState('idle'); // 'idle' | 'sending' | 'sent' | 'error'
  const [emailError, setEmailError] = useState(null);
  const [audience, setAudience] = useState('client'); // 'client' | 'clinical'
  const clinical = versions && audience === 'clinical';
  const query = clinical ? '?version=clinical' : '';
  const label = clinical ? `clinical ${reportLabel}` : reportLabel;

  function reportPdfUrl() {
    return `${appOrigin()}${apiBase}/${reportId}/${pdfPath}${query}`;
  }

  function clientLabel() {
    return `${client?.full_name || 'there'}${client?.client_number ? ` (Client #${client.client_number})` : ''}`;
  }

  function patientLabel() {
    return `${patient?.name || 'your pet'}${patient?.patient_number ? ` (Patient #${patient.patient_number})` : ''}`;
  }

  function shareViaWhatsApp() {
    if (clinical) {
      // For another clinic: choose the chat in WhatsApp.
      window.location.href = `whatsapp://send?text=${encodeURIComponent(`Clinical ${reportLabel} for ${patientLabel()} from Europets Clinic: ${reportPdfUrl()}`)}`;
      return;
    }
    const message = `Hi ${clientLabel()}, here is the ${reportLabel} for ${patientLabel()}: ${reportPdfUrl()}`;
    openWhatsApp(client?.phone, message);
  }

  async function shareViaEmail() {
    if (!client?.id) return;
    setEmailState('sending');
    setEmailError(null);
    const subject = `${patientLabel()} — ${label}`;
    const text = `Hi ${clientLabel()},\n\nHere is the ${label} for ${patientLabel()}: ${reportPdfUrl()}\n\nPlease don't hesitate to reach out if you have any questions.`;
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
      {versions && (
        <span className="share-version" role="radiogroup" aria-label="Which report">
          <span className="share-version-label">For:</span>
          {[['client', 'Owner'], ['clinical', 'Vet']].map(([v, text]) => (
            <button key={v} type="button" role="radio" aria-checked={audience === v} className={audience === v ? 'on' : ''}
              title={v === 'clinical' ? 'The clinical report, e.g. for another clinic' : "The owner's summary"}
              onClick={() => { setAudience(v); setEmailState('idle'); }}>
              {text}
            </button>
          ))}
        </span>
      )}
      <a className="share-btn" href={`${apiBase}/${reportId}/${pdfPath}${query}`} target="_blank" rel="noreferrer">
        📄 Download
      </a>
      <button type="button" className="share-btn" onClick={shareViaWhatsApp} disabled={!clinical && !client?.phone}>
        💬 WhatsApp
      </button>
      <button type="button" className="share-btn" onClick={shareViaEmail} disabled={!client?.email || emailState === 'sending'}>
        {emailState === 'sending' ? 'Sending...' : emailState === 'sent' ? '✅ Sent' : '✉️ Email'}
      </button>
      {emailState === 'error' && <span className="error">{emailError}</span>}
    </div>
  );
}
