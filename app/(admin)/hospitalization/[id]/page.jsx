// app/hospitalization/[id]/page.jsx
// A single admission: status, and the day-to-day worksheet — one entry
// per day covering appetite, condition, weight, temperature, and notes,
// each with optional file attachments (e.g. a photo of a wound) and any
// medications/goods/services given as part of that same entry. Everything
// logged across every entry gets consolidated into one invoice at
// discharge.

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AttachmentSection from '@/app/_components/AttachmentSection';
import VoiceToTextButton from '@/app/_components/VoiceToTextButton';
import { formatTime, formatDayHeader, groupNotesByDate } from '@/lib/formatTimestamp';
import CatalogPicker from '@/app/_components/CatalogPicker';
import { CONSENT_FORM_LABELS, buildConsentFormText } from '@/lib/consentTemplates';
import { printPdfUrl } from '@/lib/printPdf';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

const emptyNoteForm = {
  note_date: todayISODate(),
  author_id: '',
  appetite: '',
  condition: '',
  temperature_c: '',
  weight_kg: '',
  notes: '',
};

const emptyPendingItem = { goods_service_id: '', instructions: '', quantity: '1' };

export default function HospitalizationDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [admission, setAdmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState([]);
  const [notes, setNotes] = useState([]);
  const [noteForm, setNoteForm] = useState(emptyNoteForm);
  const [pendingItems, setPendingItems] = useState([]);
  const [pendingItemForm, setPendingItemForm] = useState(emptyPendingItem);
  const [submitting, setSubmitting] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [editingReason, setEditingReason] = useState(false);
  const [reasonDraft, setReasonDraft] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [invoiceInfo, setInvoiceInfo] = useState(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [invoiceError, setInvoiceError] = useState(null);
  const [consentForms, setConsentForms] = useState([]);
  const [consentForm, setConsentForm] = useState({
    signed_by_name: '',
    signed_by_relationship: '',
    staff_witness_id: '',
  });
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [consentError, setConsentError] = useState(null);

  const loadAdmission = () =>
    fetch(`/api/hospitalizations/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setAdmission(data);
        setLoading(false);
      });

  const loadNotes = () =>
    fetch(`/api/hospitalizations/${id}/notes`)
      .then((res) => res.json())
      .then((data) => setNotes(Array.isArray(data) ? data : []));

  const loadInvoiceInfo = () =>
    fetch(`/api/invoices?hospitalization_id=${id}`)
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setInvoiceInfo(list.find((inv) => inv.status !== 'void') || null);
      });

  const loadConsentForms = () =>
    fetch(`/api/consent-forms?hospitalization_id=${id}`)
      .then((res) => res.json())
      .then((data) => setConsentForms(Array.isArray(data) ? data : []));

  useEffect(() => {
    loadAdmission();
    loadNotes();
    loadInvoiceInfo();
    loadConsentForms();
    fetch('/api/staff')
      .then((res) => res.json())
      .then((data) => setStaff(Array.isArray(data) ? data : []));
    fetch('/api/goods-services?active=true')
      .then((res) => res.json())
      .then((data) => setCatalog(Array.isArray(data) ? data : []));
    fetch('/api/catalog-subcategories')
      .then((res) => res.json())
      .then((data) => setSubcategories(Array.isArray(data) ? data : []));

    const channel = supabase
      .channel(`hospitalization-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hospitalizations', filter: `id=eq.${id}` },
        loadAdmission
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hospitalization_notes', filter: `hospitalization_id=eq.${id}` },
        loadNotes
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'consent_forms', filter: `hospitalization_id=eq.${id}` },
        loadConsentForms
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function appendNoteText(text) {
    setNoteForm((prev) => ({ ...prev, notes: prev.notes ? `${prev.notes}\n${text}` : text }));
  }

  function addPendingItem() {
    if (!pendingItemForm.goods_service_id) return;
    const catalogItem = catalog.find((c) => c.id === pendingItemForm.goods_service_id);
    setPendingItems((prev) => [...prev, { ...pendingItemForm, name: catalogItem?.name }]);
    setPendingItemForm(emptyPendingItem);
  }

  function removePendingItem(index) {
    setPendingItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function addNote(e) {
    e.preventDefault();
    setSubmitting(true);
    await fetch(`/api/hospitalizations/${id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...noteForm, treatment_items: pendingItems }),
    });
    setNoteForm({ ...emptyNoteForm, note_date: todayISODate() });
    setPendingItems([]);
    loadNotes();
    setSubmitting(false);
  }

  async function deleteTreatmentItem(itemId) {
    await fetch(`/api/treatment-items/${itemId}`, { method: 'DELETE' });
    loadNotes();
  }

  async function addConsentForm(e) {
    e.preventDefault();
    if (!consentForm.signed_by_name.trim()) return;
    setConsentSubmitting(true);
    setConsentError(null);

    const res = await fetch('/api/consent-forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalization_id: id, form_type: 'hospitalization', ...consentForm }),
    });
    const data = await res.json();

    if (!res.ok) {
      setConsentError(data.error || 'Failed to save consent form');
    } else {
      setConsentForm({ signed_by_name: '', signed_by_relationship: '', staff_witness_id: '' });
      loadConsentForms();
      printPdfUrl(`/api/consent-forms/${data.id}/pdf`);
    }
    setConsentSubmitting(false);
  }

  async function createInvoice() {
    setCreatingInvoice(true);
    setInvoiceError(null);
    try {
      const res = await fetch(`/api/hospitalizations/${id}/invoice`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        router.push(`/invoices/${data.id}`);
      } else {
        setInvoiceError(data.error || 'Failed to create invoice');
      }
    } catch (err) {
      setInvoiceError(err.message || 'Failed to create invoice');
    }
    setCreatingInvoice(false);
  }

  function downloadSummaryPdf() {
    // A cache-busting query param, on top of the route's own no-store
    // headers, so a browser/download manager can never reuse a previous
    // download of this admission's summary after it's been edited.
    window.open(`/api/hospitalizations/${id}/summary-pdf?t=${Date.now()}`, '_blank');
  }

  function shareViaWhatsApp() {
    const phone = (admission.clients?.phone || '').replace(/\D/g, '');
    const message = `Hi ${admission.clients?.full_name || 'there'}, here's the daily care update for ${admission.patients?.name || 'your pet'} during their stay with us. Please attach the summary PDF you just downloaded to this chat.`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }

  function portalUrl() {
    return `${window.location.origin}/portal/hospitalization/${id}`;
  }

  function sharePortalLink() {
    const phone = (admission.clients?.phone || '').replace(/\D/g, '');
    const message = `Hi ${admission.clients?.full_name || 'there'}, you can follow ${admission.patients?.name || 'your pet'}'s care updates and photos here, live, for the rest of their stay with us: ${portalUrl()}`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }

  async function copyPortalLink() {
    await navigator.clipboard.writeText(portalUrl());
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  function startEditReason() {
    setReasonDraft(admission.reason || '');
    setEditingReason(true);
  }

  async function saveReason() {
    await fetch(`/api/hospitalizations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reasonDraft }),
    });
    setEditingReason(false);
    loadAdmission();
  }

  async function discharge() {
    await fetch(`/api/hospitalizations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'discharged' }),
    });
    loadAdmission();
  }

  if (loading || !admission) return <p>Loading admission...</p>;
  if (admission.error) return <p>Admission not found.</p>;

  return (
    <div>
      <p>
        <a href="/hospitalization">&larr; All admissions</a>
      </p>
      <div className="page-header">
        <h1>
          {admission.patients?.name} <span>({admission.status})</span>
        </h1>
        <a href="/hospitalization/cages" className="button-link">
          🗺️ Cage Layout
        </a>
      </div>
      <p>
        Owner: <a href={`/clients/${admission.clients?.id}`}>{admission.clients?.full_name}</a> ·
        Cage: {admission.cages?.name || '—'} · Admitted:{' '}
        {new Date(admission.admitted_at).toLocaleString()}
        {admission.discharged_at &&
          ` · Discharged: ${new Date(admission.discharged_at).toLocaleString()}`}
      </p>
      {editingReason ? (
        <p className="reason-edit">
          <input
            value={reasonDraft}
            onChange={(e) => setReasonDraft(e.target.value)}
            placeholder="Reason for admission"
            autoFocus
          />
          <button type="button" onClick={saveReason}>
            Save
          </button>
          <button type="button" onClick={() => setEditingReason(false)}>
            Cancel
          </button>
        </p>
      ) : (
        <p>
          Reason: {admission.reason || <em>none given</em>}{' '}
          <button type="button" className="reason-edit-btn" onClick={startEditReason}>
            Edit
          </button>
        </p>
      )}
      {admission.status === 'admitted' && (
        <button type="button" onClick={discharge}>
          Discharge
        </button>
      )}
      {admission.originating_visit_id && (
        <p>
          <a href={`/consults/${admission.originating_visit_id}`}>View originating consult</a>
        </p>
      )}

      <details className="case-files" open={consentForms.length === 0}>
        <summary>📝 Consent Forms {consentForms.length > 0 && `(${consentForms.length} signed)`}</summary>
        {consentForms.map((cf) => (
          <div key={cf.id} className="visit-card">
            <strong>{CONSENT_FORM_LABELS[cf.form_type] || cf.form_type}</strong>
            <p>
              Signed by {cf.signed_by_name}
              {cf.signed_by_relationship && ` (${cf.signed_by_relationship})`} ·{' '}
              {new Date(cf.signed_at).toLocaleString()}
              {cf.staff?.full_name && ` · Witnessed by ${cf.staff.full_name}`}
            </p>
            <a href={`/api/consent-forms/${cf.id}/pdf`} target="_blank" rel="noreferrer">
              📄 Download signed PDF
            </a>
          </div>
        ))}
        <form className="card" onSubmit={addConsentForm}>
          <h3>Sign Hospitalization Consent</h3>
          {consentError && <p className="error">{consentError}</p>}
          <div className="consent-text-box">
            {buildConsentFormText('hospitalization', { name: admission.patients?.name })}
          </div>
          <input
            placeholder="Signed by (full name)"
            required
            value={consentForm.signed_by_name}
            onChange={(e) => setConsentForm({ ...consentForm, signed_by_name: e.target.value })}
          />
          <input
            placeholder="Relationship to pet (e.g. Owner) — optional"
            value={consentForm.signed_by_relationship}
            onChange={(e) => setConsentForm({ ...consentForm, signed_by_relationship: e.target.value })}
          />
          <select
            value={consentForm.staff_witness_id}
            onChange={(e) => setConsentForm({ ...consentForm, staff_witness_id: e.target.value })}
          >
            <option value="">Witnessed by (staff)...</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={consentSubmitting}>
            {consentSubmitting ? 'Saving...' : 'Sign & Save Consent Form'}
          </button>
        </form>
      </details>

      <div className="split">
      <div className="split-main">
      <h2>Day-to-day Worksheet</h2>
      {notes.length === 0 && <p>No entries yet.</p>}
      {groupNotesByDate(notes).map((group) => (
        <div key={group.date} className="worksheet-day">
          <h3 className="worksheet-day-header">
            {formatDayHeader(group.date)}{' '}
            <span className="worksheet-day-count">
              {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
            </span>
          </h3>
          {group.entries.map((n) => (
            <div key={n.id} className="visit-card">
              <div className="visit-header">
                <strong>{formatTime(n.created_at)}</strong>
                <span>{n.staff?.full_name || 'unassigned'}</span>
              </div>
              <p>
                {n.appetite && (
                  <>
                    <strong>Appetite:</strong> {n.appetite}{' '}
                  </>
                )}
                {n.weight_kg != null && (
                  <>
                    · <strong>Weight:</strong> {n.weight_kg}kg{' '}
                  </>
                )}
                {n.temperature_c != null && (
                  <>
                    · <strong>Temp:</strong> {n.temperature_c}°C{' '}
                  </>
                )}
              </p>
              {n.condition && (
                <p>
                  <strong>Condition:</strong> {n.condition}
                </p>
              )}
              {n.notes && <p>{n.notes}</p>}
              {n.treatment_items?.length > 0 && (
                <ul className="worksheet-entry-items">
                  {n.treatment_items.map((t) => (
                    <li key={t.id}>
                      {t.goods_services?.name}
                      {t.quantity > 1 ? ` ×${t.quantity}` : ''}
                      {t.instructions && ` — ${t.instructions}`}
                      <button type="button" onClick={() => deleteTreatmentItem(t.id)}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <AttachmentSection entityType="hospitalization_note" entityId={n.id} />
            </div>
          ))}
        </div>
      ))}
      </div>

      <div className="split-aside">
      <details className="case-files">
        <summary>📎 Case Photos &amp; Files</summary>
        <p className="visit-meta">
          Not tied to a single worksheet entry — admission photo, wound progress, etc.
        </p>
        <AttachmentSection entityType="hospitalization" entityId={id} />
      </details>

      <form className="card" onSubmit={addNote}>
        <h3>Add Worksheet Entry</h3>
        <input
          type="date"
          required
          value={noteForm.note_date}
          onChange={(e) => setNoteForm({ ...noteForm, note_date: e.target.value })}
        />
        <select
          value={noteForm.author_id}
          onChange={(e) => setNoteForm({ ...noteForm, author_id: e.target.value })}
        >
          <option value="">Author...</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
        <select
          value={noteForm.appetite}
          onChange={(e) => setNoteForm({ ...noteForm, appetite: e.target.value })}
        >
          <option value="">Appetite...</option>
          <option value="good">Good</option>
          <option value="reduced">Reduced</option>
          <option value="none">None</option>
        </select>
        <input
          type="number"
          step="0.01"
          placeholder="Weight (kg)"
          value={noteForm.weight_kg}
          onChange={(e) => setNoteForm({ ...noteForm, weight_kg: e.target.value })}
        />
        <input
          type="number"
          step="0.1"
          placeholder="Temperature (°C)"
          value={noteForm.temperature_c}
          onChange={(e) => setNoteForm({ ...noteForm, temperature_c: e.target.value })}
        />
        <input
          placeholder="General condition"
          value={noteForm.condition}
          onChange={(e) => setNoteForm({ ...noteForm, condition: e.target.value })}
        />
        <label>
          <span className="field-label-row">
            Notes
            <VoiceToTextButton kind="hospitalization_notes" onResult={appendNoteText} />
          </span>
          <textarea
            rows={2}
            value={noteForm.notes}
            onChange={(e) => setNoteForm({ ...noteForm, notes: e.target.value })}
          />
        </label>

        <fieldset className="pending-items">
          <legend>Medications / Goods / Services given</legend>
          {pendingItems.length > 0 && (
            <ul className="pending-items-list">
              {pendingItems.map((p, i) => (
                <li key={i}>
                  {p.name}
                  {p.quantity > 1 ? ` ×${p.quantity}` : ''}
                  {p.instructions && ` — ${p.instructions}`}
                  <button type="button" onClick={() => removePendingItem(i)}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <CatalogPicker
            catalog={catalog}
            subcategories={subcategories}
            value={pendingItemForm.goods_service_id}
            onChange={(value) => setPendingItemForm({ ...pendingItemForm, goods_service_id: value })}
            onItemCreated={(item) => setCatalog((prev) => [...prev, item])}
          />
          <input
            placeholder="Instructions (dosage, frequency, duration)"
            value={pendingItemForm.instructions}
            onChange={(e) => setPendingItemForm({ ...pendingItemForm, instructions: e.target.value })}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Quantity"
            value={pendingItemForm.quantity}
            onChange={(e) => setPendingItemForm({ ...pendingItemForm, quantity: e.target.value })}
          />
          <button type="button" className="secondary" onClick={addPendingItem}>
            + Add Item
          </button>
        </fieldset>

        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Add Entry'}
        </button>
      </form>
      </div>
      </div>

      <h3>Invoice</h3>
      {invoiceInfo ? (
        <p>
          <a href={`/invoices/${invoiceInfo.id}`}>View Invoice</a> ({invoiceInfo.status})
        </p>
      ) : (
        <>
          {invoiceError && <p className="error">{invoiceError}</p>}
          <button type="button" onClick={createInvoice} disabled={creatingInvoice}>
            {creatingInvoice ? 'Creating...' : '🧾 Create Invoice from Worksheet'}
          </button>
          <p className="visit-meta">
            Opens a new invoice and imports every medication/goods/service logged across the
            whole worksheet as a line item — typically done at discharge. You can still add more
            items to the invoice afterward.
          </p>
        </>
      )}

      <div className="share-actions">
        <button type="button" className="share-btn" onClick={downloadSummaryPdf}>
          📄 Summary PDF
        </button>
        <button type="button" className="share-btn" onClick={shareViaWhatsApp}>
          💬 Share PDF
        </button>
        <button type="button" className="share-btn" onClick={sharePortalLink}>
          🔗 Share Portal Link
        </button>
        <button type="button" className="share-btn" onClick={copyPortalLink}>
          {linkCopied ? 'Copied!' : 'Copy Link'}
        </button>
      </div>
      <p className="share-hint">
        PDF sharing needs a manual attach step in WhatsApp; the portal link doesn&apos;t — it's a
        live, read-only page that updates automatically until discharge.
      </p>
    </div>
  );
}
