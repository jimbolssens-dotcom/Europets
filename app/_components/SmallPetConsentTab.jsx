'use client';

// The "📝 Consent" tab on a consult for a small pet or exotic (lib/smallPet.js):
// the Small Pet & Exotic Handling Consent (lib/consentTemplates.js), signed
// in person or sent to the owner, BEFORE the animal is handled at all,
// since stress from handling alone can kill these species. Amber until a
// form is signed. Same sign / send flow as the hospitalization page's
// consent tab; the server rebuilds the signed text itself.

import { useEffect, useState } from 'react';
import { CONSENT_FORM_LABELS, buildConsentFormText } from '@/lib/consentTemplates';
import { appOrigin } from '@/lib/appOrigin';
import { printPdfUrl } from '@/lib/printPdf';
import { formatDateTime } from '@/lib/formatTimestamp';
import PdfPreviewModal from '@/app/_components/PdfPreviewModal';
import ConsentText from '@/app/_components/ConsentText';

const FORM_TYPE = 'small_pet';

export default function SmallPetConsentTab({ visitId, patient, client, staff = [], treatmentItems = [], treatmentNotes }) {
  const [signed, setSigned] = useState([]);
  const [form, setForm] = useState({ signed_by_name: '', signed_by_relationship: '', staff_witness_id: '' });
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [previewPdfUrl, setPreviewPdfUrl] = useState(null);

  const load = () =>
    fetch(`/api/consent-forms?visit_id=${visitId}`)
      .then((res) => res.json())
      .then((data) => setSigned(Array.isArray(data) ? data.filter((cf) => cf.form_type === FORM_TYPE) : []))
      .catch(() => {});

  useEffect(() => {
    load();
  }, [visitId]);

  async function sign(e) {
    e.preventDefault();
    if (!form.signed_by_name.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch('/api/consent-forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: visitId, form_type: FORM_TYPE, ...form }),
    });
    const data = await res.json().catch(() => null);
    setSubmitting(false);
    if (!res.ok) {
      setError(data?.error || 'Failed to save consent form');
      return;
    }
    setForm({ signed_by_name: '', signed_by_relationship: '', staff_witness_id: '' });
    load();
    printPdfUrl(`/api/consent-forms/${data.id}/pdf`, { onFallback: () => setPreviewPdfUrl(`/api/consent-forms/${data.id}/pdf`) });
  }

  async function sendLink() {
    setError(null);
    setInfo(null);
    setSending(true);
    const res = await fetch('/api/consent-form-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: visitId, form_type: FORM_TYPE, sent_to_phone: client?.phone || null }),
    });
    const data = await res.json().catch(() => null);
    setSending(false);
    if (!res.ok) {
      setError(data?.error || 'Failed to generate a consent link');
      return;
    }
    if (data.whatsapp?.sent) {
      setInfo('Sent, the link was WhatsApped to the owner.');
    } else {
      const url = `${appOrigin()}/portal/consent/${data.id}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      setError(`Could not send over WhatsApp (${data.whatsapp?.reason || 'unknown reason'}), link copied to clipboard instead.`);
    }
  }

  return (
    <details className="case-tab-menu" name="case-tabs">
      <summary className={`case-tab${signed.length === 0 ? ' case-tab-warn' : ''}`}>
        📝 Consent {signed.length === 0 ? '· not signed' : <b>✓ {signed.length}</b>}
      </summary>
      <div className="case-tab-dropdown case-tab-dropdown-wide">
        {signed.map((cf) => (
          <div key={cf.id} className="visit-card">
            <strong>{CONSENT_FORM_LABELS[cf.form_type]}</strong>
            <p>
              Signed by {cf.signed_by_name}
              {cf.signed_by_relationship && ` (${cf.signed_by_relationship})`} · {formatDateTime(cf.signed_at)}
              {cf.staff?.full_name && ` · Witnessed by ${cf.staff.full_name}`}
            </p>
            <a href={`/api/consent-forms/${cf.id}/pdf`} target="_blank" rel="noreferrer">
              📄 Download signed PDF
            </a>
          </div>
        ))}
        <form className="card" onSubmit={sign}>
          <h3>
            Sign {CONSENT_FORM_LABELS[FORM_TYPE]} <small className="visit-meta">⚠️ before {patient?.name || 'the patient'} is handled at all</small>
          </h3>
          {error && <p className="error">{error}</p>}
          {info && <p className="visit-meta">{info}</p>}
          <ConsentText text={buildConsentFormText(FORM_TYPE, { name: patient?.name, species: patient?.species }, { treatmentItems, treatmentNotes })} />
          <input
            placeholder="Signed by (full name)"
            required
            value={form.signed_by_name}
            onChange={(e) => setForm({ ...form, signed_by_name: e.target.value })}
          />
          <input
            placeholder="Relationship to pet (e.g. Owner), optional"
            value={form.signed_by_relationship}
            onChange={(e) => setForm({ ...form, signed_by_relationship: e.target.value })}
          />
          <select value={form.staff_witness_id} onChange={(e) => setForm({ ...form, staff_witness_id: e.target.value })}>
            <option value="">Witnessed by (staff)...</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
          <div className="consent-form-actions">
            <button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : 'Sign'}
            </button>
            <button type="button" onClick={sendLink} disabled={sending}>
              {sending ? 'Sending...' : 'WhatsApp'}
            </button>
          </div>
        </form>
      </div>
      {previewPdfUrl && <PdfPreviewModal url={previewPdfUrl} onClose={() => setPreviewPdfUrl(null)} />}
    </details>
  );
}
