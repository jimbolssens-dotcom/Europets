// app/hospitalization/[id]/page.jsx
// A single admission: status, and the day-to-day worksheet — one entry
// per day covering weight, temperature, and free-text notes (appetite/
// condition just go in Notes rather than their own fields), each with
// optional file attachments (e.g. a photo of a wound) and any
// medications/goods/services given as part of that same entry. Everything
// logged across every entry gets consolidated into one invoice at
// discharge.

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AttachmentSection from '@/app/_components/AttachmentSection';
import AudioRecorder from '@/app/_components/AudioRecorder';
import { hasCheckinData, buildEmpathicCheckinText } from '@/lib/hospitalizationCheckin';
import VoiceToTextButton from '@/app/_components/VoiceToTextButton';
import { formatTime, formatDayHeader, formatDateTime, groupNotesByDate } from '@/lib/formatTimestamp';
import { isWithinOfficeHours } from '@/lib/officeHours';
import CatalogPicker from '@/app/_components/CatalogPicker';
import AdministrationRoutePicker from '@/app/_components/AdministrationRoutePicker';
import { ADD_ITEM_LABELS } from '@/lib/catalogGrouping';
import { ADMINISTRATION_METHOD_LABELS, resolveAdministrationMethod } from '@/lib/administrationMethods';
import { CONSENT_FORM_LABELS, buildConsentFormText } from '@/lib/consentTemplates';
import { printPdfUrl } from '@/lib/printPdf';
import PdfPreviewModal from '@/app/_components/PdfPreviewModal';
import InfoHint from '@/app/_components/InfoHint';
import DayTreatmentPlan from '@/app/_components/DayTreatmentPlan';
import ProcedureChecklist from '@/app/_components/ProcedureChecklist';
import DayProcedureNotes from '@/app/_components/DayProcedureNotes';
import HospitalizationReportsSection from '@/app/_components/HospitalizationReportsSection';
import PatientHistoryPanel from '@/app/_components/PatientHistoryPanel';
import PatientReportOverview from '@/app/_components/PatientReportOverview';
import { useVaccinations } from '@/app/_components/useVaccinations';
import VaccinationForm from '@/app/_components/VaccinationForm';
import VaccinationHistory from '@/app/_components/VaccinationHistory';
import { openWhatsApp } from '@/lib/whatsapp';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

const emptyNoteForm = {
  note_date: todayISODate(),
  author_id: '',
  temperature_c: '',
  weight_kg: '',
  notes: '',
};

const emptyPendingItem = { goods_service_id: '', instructions: '', quantity: '1', administration_method: '' };
const emptyDayAddForm = { goods_service_id: '', instructions: '', quantity: '1', administration_method: '' };

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
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteForm, setEditNoteForm] = useState(null);
  const [savingEditNote, setSavingEditNote] = useState(false);
  const [deletingNote, setDeletingNote] = useState(false);
  const [editNoteError, setEditNoteError] = useState(null);
  const [noteDeleteVersion, setNoteDeleteVersion] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);
  const [editingReason, setEditingReason] = useState(false);
  const [reasonDraft, setReasonDraft] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [invoiceInfo, setInvoiceInfo] = useState(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [invoiceError, setInvoiceError] = useState(null);
  const [addingConsult, setAddingConsult] = useState(false);
  const [addConsultError, setAddConsultError] = useState(null);
  const [previewPdfUrl, setPreviewPdfUrl] = useState(null);
  const [consentForms, setConsentForms] = useState([]);
  const [consentForm, setConsentForm] = useState({
    signed_by_name: '',
    signed_by_relationship: '',
    staff_witness_id: '',
  });
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [consentError, setConsentError] = useState(null);
  const [sendingConsentLink, setSendingConsentLink] = useState(false);
  // The originating consult's own treatment plan (if this admission came
  // from one) — folded into the consent form's preview text below, same
  // as the server does when the form is actually signed (see
  // lib/consentForms.js's resolveConsentFormContext).
  const [originVisitPlan, setOriginVisitPlan] = useState({ treatmentNotes: null, treatmentItems: [] });
  // The day procedure/hospitalization's own dictated checklist — folded
  // into the consent preview the same way the server does (see
  // lib/consentForms.js's resolveConsentFormContext).
  const [consentPlanItems, setConsentPlanItems] = useState([]);
  const [expandedDay, setExpandedDay] = useState(null);
  const [dayAddForm, setDayAddForm] = useState(emptyDayAddForm);
  const [dayAddSubmitting, setDayAddSubmitting] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [itemEditForm, setItemEditForm] = useState({ instructions: '', quantity: '' });
  const [savingItemEdit, setSavingItemEdit] = useState(false);
  const [noteAddItemForm, setNoteAddItemForm] = useState(emptyPendingItem);
  const [noteAddItemSubmitting, setNoteAddItemSubmitting] = useState(false);
  const [dayAddCategory, setDayAddCategory] = useState('product');
  const [noteAddCategory, setNoteAddCategory] = useState('product');
  const [pendingItemCategory, setPendingItemCategory] = useState('product');
  const [reportsOpen, setReportsOpen] = useState(false);

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

  useEffect(() => {
    const visitId = admission?.originating_visit_id;
    if (!visitId) {
      setOriginVisitPlan({ treatmentNotes: null, treatmentItems: [] });
      return;
    }
    Promise.all([
      fetch(`/api/visits/${visitId}`).then((res) => res.json()),
      fetch(`/api/treatment-items?visit_id=${visitId}`).then((res) => res.json()),
    ]).then(([visit, treatmentItems]) => {
      setOriginVisitPlan({
        treatmentNotes: visit?.treatment_notes || null,
        treatmentItems: Array.isArray(treatmentItems) ? treatmentItems : [],
      });
    });
  }, [admission?.originating_visit_id]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/hospitalizations/${id}/plan-items`)
      .then((res) => res.json())
      .then((data) => setConsentPlanItems(Array.isArray(data) ? data : []));
  }, [id]);

  // Day procedures get their own Vaccination card in the Day Procedure
  // Report section below, same hook/form the consult page uses — a
  // vaccine given during a day procedure is still just a vaccination
  // record against the patient, not something tied to the hospitalization.
  const vac = useVaccinations(admission?.patients?.id, admission?.patients?.species);

  function appendNoteText(text) {
    setNoteForm((prev) => ({ ...prev, notes: prev.notes ? `${prev.notes}\n${text}` : text }));
  }

  // Applies a recording's extracted fields to the still-unsaved "Add
  // Worksheet Entry" draft — weight/temperature only fill in if still
  // empty (there's no sensible way to "append" to a number). appetite/
  // condition/notes all fold into the one Notes field (no separate
  // appetite/condition inputs anymore), appending the same way a
  // consult's text fields do. Matched catalog items are added to the
  // pending list exactly as if "+ Add Item" had been clicked for each.
  function applyExtractedFields(fields) {
    setNoteForm((prev) => {
      const next = { ...prev };
      if (fields.weight_kg != null && !next.weight_kg) next.weight_kg = fields.weight_kg;
      if (fields.temperature_c != null && !next.temperature_c) next.temperature_c = fields.temperature_c;
      const extraNotes = [fields.appetite ? `Appetite: ${fields.appetite}` : null, fields.condition, fields.notes]
        .filter(Boolean)
        .join('\n');
      if (extraNotes) {
        next.notes = next.notes ? `${next.notes}\n\n${extraNotes}` : extraNotes;
      }
      return next;
    });

    if (fields.items?.length) {
      setPendingItems((prev) => [
        ...prev,
        ...fields.items.map((item) => ({
          goods_service_id: item.goods_service_id,
          instructions: item.instructions || '',
          quantity: item.quantity || 1,
          name: item.name,
          administration_method: catalog.find((c) => c.id === item.goods_service_id)?.administration_method,
        })),
      ]);
    }
  }

  function addPendingItem() {
    if (!pendingItemForm.goods_service_id) return;
    const catalogItem = catalog.find((c) => c.id === pendingItemForm.goods_service_id);
    const resolved = resolveAdministrationMethod(catalogItem?.administration_method, pendingItemForm.administration_method);
    if (resolved.error) return;
    setPendingItems((prev) => [
      ...prev,
      { ...pendingItemForm, name: catalogItem?.name, administration_method: resolved.administration_method },
    ]);
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

  // A day's medication log — click the date header to expand it, in place
  // of navigating anywhere. Reads across every entry logged that date (a
  // multi-day stay can have several), regardless of which specific entry
  // each medication was originally logged under.
  function toggleDay(date) {
    setExpandedDay((prev) => (prev === date ? null : date));
    setDayAddForm(emptyDayAddForm);
    setEditingItemId(null);
  }

  // New medications added from the day view attach to that day's most
  // recent entry (dayEntries is already newest-first — see
  // groupNotesByDate) rather than asking which entry each one belongs to.
  async function addDayMedication(dayEntries) {
    if (!dayAddForm.goods_service_id) return;
    const latestNote = dayEntries[0];
    setDayAddSubmitting(true);
    await fetch('/api/treatment-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalization_note_id: latestNote.id, ...dayAddForm }),
    });
    setDayAddForm(emptyDayAddForm);
    setDayAddSubmitting(false);
    loadNotes();
  }

  function startEditItem(item) {
    setEditingItemId(item.id);
    setItemEditForm({ instructions: item.instructions || '', quantity: item.quantity ?? 1 });
  }

  function cancelEditItem() {
    setEditingItemId(null);
  }

  async function saveEditItem(itemId) {
    setSavingItemEdit(true);
    await fetch(`/api/treatment-items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itemEditForm),
    });
    setSavingItemEdit(false);
    setEditingItemId(null);
    loadNotes();
  }

  // Adds a new medication/service/test straight to the entry currently
  // being edited (unlike the day-level "+ Add Medication", which always
  // attaches to that day's most recent entry — here the target entry is
  // explicit, since it's the one already open for editing).
  async function addItemToNote(noteId) {
    if (!noteAddItemForm.goods_service_id) return;
    setNoteAddItemSubmitting(true);
    await fetch('/api/treatment-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalization_note_id: noteId, ...noteAddItemForm }),
    });
    setNoteAddItemForm(emptyPendingItem);
    setNoteAddItemSubmitting(false);
    loadNotes();
  }

  function startEditNote(n) {
    setEditingNoteId(n.id);
    setEditNoteError(null);
    setNoteAddItemForm(emptyPendingItem);
    setEditNoteForm({
      note_date: n.note_date || todayISODate(),
      author_id: n.author_id || '',
      drinking: n.drinking || '',
      stool: n.stool || '',
      urine: n.urine || '',
      vomit: n.vomit || '',
      mood: n.mood || '',
      temperature_feel: n.temperature_feel || '',
      temperature_c: n.temperature_c ?? '',
      weight_kg: n.weight_kg ?? '',
      notes: n.notes || '',
      client_summary: n.client_summary ?? (hasCheckinData(n) ? buildEmpathicCheckinText(n, admission?.patients?.name) : ''),
    });
  }

  function cancelEditNote() {
    setEditNoteError(null);
    setEditingNoteId(null);
    setEditNoteForm(null);
    setNoteAddItemForm(emptyPendingItem);
  }

  async function saveEditNote(noteId) {
    setSavingEditNote(true);
    await fetch(`/api/hospitalizations/${id}/notes/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editNoteForm),
    });
    setSavingEditNote(false);
    setEditingNoteId(null);
    setEditNoteForm(null);
    loadNotes();
  }

  async function deleteNote(noteId) {
    if (!confirm('Delete this worksheet entry and its treatment items? Existing invoices will not change. Attached files will remain under Case Photos & Files.')) return;
    setDeletingNote(true);
    setEditNoteError(null);
    try {
      const response = await fetch(`/api/hospitalizations/${id}/notes/${noteId}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not delete the entry.');
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
      cancelEditNote();
      setNoteDeleteVersion((version) => version + 1);
      loadNotes();
    } catch (error) {
      setEditNoteError(error.message);
    } finally {
      setDeletingNote(false);
    }
  }

  async function addConsentForm(e) {
    e.preventDefault();
    if (!consentForm.signed_by_name.trim()) return;
    setConsentSubmitting(true);
    setConsentError(null);

    const res = await fetch('/api/consent-forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalization_id: id, form_type: consentFormType, ...consentForm }),
    });
    const data = await res.json();

    if (!res.ok) {
      setConsentError(data.error || 'Failed to save consent form');
    } else {
      setConsentForm({ signed_by_name: '', signed_by_relationship: '', staff_witness_id: '' });
      loadConsentForms();
      printPdfUrl(`/api/consent-forms/${data.id}/pdf`, {
        onFallback: () => setPreviewPdfUrl(`/api/consent-forms/${data.id}/pdf`),
      });
    }
    setConsentSubmitting(false);
  }

  // Alternative to signing in person: sends the owner a link to review and
  // digitally sign (by typing their name) on their own phone, then WhatsApps
  // it — same pattern as sendConsentLink on the consult page.
  async function sendConsentLink() {
    setConsentError(null);
    setSendingConsentLink(true);
    const res = await fetch('/api/consent-form-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hospitalization_id: id,
        form_type: consentFormType,
        sent_to_phone: admission.clients?.phone || null,
      }),
    });
    const data = await res.json().catch(() => null);
    setSendingConsentLink(false);
    if (!res.ok) {
      setConsentError(data?.error || 'Failed to generate a consent link');
      return;
    }
    const url = `${window.location.origin}/portal/consent/${data.id}`;
    const digits = (admission.clients?.phone || '').replace(/\D/g, '');
    const clientLabel = `${admission.clients?.full_name || 'there'}${
      admission.clients?.client_number ? ` (Client #${admission.clients.client_number})` : ''
    }`;
    const patientLabel = `${admission.patients?.name || 'your pet'}${
      admission.patients?.patient_number ? ` (Patient #${admission.patients.patient_number})` : ''
    }`;
    const message = `Hi ${clientLabel}! Please review and sign this consent form for ${patientLabel}: ${url}`;
    if (digits.length > 3) {
      openWhatsApp(admission.clients?.phone, message);
    } else {
      await navigator.clipboard.writeText(url);
      setConsentError('No phone number on file — link copied to clipboard instead.');
    }
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

  function portalUrl() {
    return `${window.location.origin}/portal/hospitalization/${id}`;
  }

  function shareViaWhatsApp() {
    const clientLabel = `${admission.clients?.full_name || 'there'}${
      admission.clients?.client_number ? ` (Client #${admission.clients.client_number})` : ''
    }`;
    const patientLabel = `${admission.patients?.name || 'your pet'}${
      admission.patients?.patient_number ? ` (Patient #${admission.patients.patient_number})` : ''
    }`;
    const message = `Hi ${clientLabel}, here's the live care update page for ${patientLabel} during their stay with us: ${portalUrl()}`;
    openWhatsApp(admission.clients?.phone, message);
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

  async function moveToHospital() {
    if (!confirm('Move this day procedure to a full hospital admission?')) return;
    await fetch(`/api/hospitalizations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'admission' }),
    });
    loadAdmission();
  }

  async function addConsult() {
    setAddingConsult(true);
    setAddConsultError(null);
    try {
      const res = await fetch(`/api/hospitalizations/${id}/add-consult`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add a consult.');
      router.push(`/consults/${data.id}`);
    } catch (error) {
      setAddConsultError(error.message);
    } finally {
      setAddingConsult(false);
    }
  }

  // Dismisses the "owner is waiting" flag (and the blinking cage on the
  // Cage Layout page) without necessarily logging a worksheet entry —
  // that also clears it automatically (see the notes route), this is for
  // when staff have already responded some other way (in person, phone).
  async function dismissUpdateRequest() {
    await fetch(`/api/hospitalizations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ update_requested_at: null }),
    });
    loadAdmission();
  }

  if (loading || !admission) return <p>Loading admission...</p>;
  if (admission.error) return <p>Admission not found.</p>;

  const selectedPendingItem = catalog.find((c) => c.id === pendingItemForm.goods_service_id);
  const selectedDayAddItem = catalog.find((c) => c.id === dayAddForm.goods_service_id);
  const selectedNoteAddItem = catalog.find((c) => c.id === noteAddItemForm.goods_service_id);
  const consentFormType = admission.kind === 'day_procedure' ? 'day_procedure' : 'hospitalization';
  const consentPreviewPlan = {
    treatmentNotes: originVisitPlan.treatmentNotes,
    treatmentItems: [...originVisitPlan.treatmentItems, ...consentPlanItems],
  };

  const consentFormsSection = (
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
        <h3>Sign {CONSENT_FORM_LABELS[consentFormType]}</h3>
        {consentError && <p className="error">{consentError}</p>}
        <p className="visit-meta">
          Patient: {admission.patients?.name}
          {admission.patients?.patient_number ? ` (Patient #${admission.patients.patient_number})` : ''} · Owner:{' '}
          {admission.clients?.full_name}
          {admission.clients?.client_number ? ` (Client #${admission.clients.client_number})` : ''}
        </p>
        <div className="consent-text-box">
          {buildConsentFormText(consentFormType, { name: admission.patients?.name }, consentPreviewPlan)}
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
        <div className="consent-form-actions">
          <button type="submit" disabled={consentSubmitting}>
            {consentSubmitting ? 'Saving...' : 'Sign'}
          </button>
          <button type="button" onClick={sendConsentLink} disabled={sendingConsentLink}>
            {sendingConsentLink ? 'Sending...' : 'WhatsApp'}
          </button>
        </div>
      </form>
    </details>
  );

  const patientHistorySection = (
    <PatientHistoryPanel
      patientId={admission.patient_id}
      clientId={admission.client_id}
      excludeHospitalizationId={id}
      excludeVisitId={admission.originating_visit_id}
    />
  );

  return (
    <div>
      <div className="page-header">
        <h1>
          {admission.patients?.name}
          {admission.patients?.patient_number ? ` (Patient #${admission.patients.patient_number})` : ''}{' '}
          <span>({admission.status})</span>{' '}
          {admission.kind === 'day_procedure' && <span className="day-procedure-badge">📋 Day Procedure</span>}
        </h1>
      </div>
      {admission.update_requested_at && (
        <div className="update-requested-banner">
          <span>
            🔔 {admission.clients?.full_name || 'The owner'}
            {admission.clients?.client_number ? ` (Client #${admission.clients.client_number})` : ''} requested an
            update at{' '}
            {formatDateTime(admission.update_requested_at)}
            {!isWithinOfficeHours(new Date(admission.update_requested_at)) && ' (after hours)'}
            {admission.update_request_message && <> — &quot;{admission.update_request_message}&quot;</>}
          </span>
          <button type="button" onClick={dismissUpdateRequest}>
            Dismiss
          </button>
        </div>
      )}
      <p>
        Owner:{' '}
        <a href={`/clients/${admission.clients?.id}`}>
          {admission.clients?.full_name}
          {admission.clients?.client_number ? ` (Client #${admission.clients.client_number})` : ''}
        </a>{' '}
        · Patient: <a href={`/patients/${admission.patients?.id}`}>record</a> ·
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
      {admission.kind === 'day_procedure' ? (
        <>
          <div className="hospitalization-actions" role="group" aria-label="Day procedure actions">
            {admission.status === 'admitted' && (
              <button type="button" className="button-link" onClick={discharge}>Complete</button>
            )}
            <button type="button" className={`button-link${invoiceInfo ? ' button-link-invoice' : ''}`} onClick={createInvoice} disabled={creatingInvoice}
              title={invoiceInfo ? `Open the invoice (${invoiceInfo.status}), syncing in anything new from the checklist` : 'Create an invoice from the medications, goods and services on the checklist'}>
              {creatingInvoice ? 'Saving…' : invoiceInfo ? `Invoiced (${invoiceInfo.status})` : 'Invoice'}
            </button>
            {admission.originating_visit_id ? (
              <a className="button-link button-link-consult" href={`/consults/${admission.originating_visit_id}`}>Consult</a>
            ) : (
              <button type="button" className="button-link" onClick={addConsult} disabled={addingConsult}
                title="Most day procedures don't need one — only add this if you also want to write up an exam/consult note">
                {addingConsult ? 'Adding…' : 'Add Consult'}
              </button>
            )}
            <button type="button" className="button-link" onClick={moveToHospital} title="This case needs to stay longer than planned">
              Move to Hospital
            </button>
            <a className="button-link" href="/day-procedures">Day Procedures</a>
          </div>
          {addConsultError && <p className="error" role="alert">{addConsultError}</p>}
          {invoiceError && <p className="error" role="alert">{invoiceError}</p>}

          <details className="case-files">
            <summary>📎 Case Photos &amp; Files</summary>
            <AttachmentSection entityType="hospitalization" entityId={id} refreshKey={noteDeleteVersion} />
          </details>

          <ProcedureChecklist
            key={`${id}-${noteDeleteVersion}`}
            hospitalizationId={id}
            staff={staff}
            catalog={catalog}
            subcategories={subcategories}
            onCatalogItemCreated={(item) => setCatalog((prev) => [...prev, item])}
          />

          <section className="case-files-open" aria-label="Day Procedure Report">
            <h2>Day Procedure Report</h2>
            <DayProcedureNotes hospitalizationId={id} staff={staff} />
            <PatientReportOverview patientId={admission.patient_id} title="Earlier reports for this patient" />
            <HospitalizationReportsSection
              hospitalizationId={id}
              admission={admission}
              staff={staff}
              catalog={catalog}
              subcategories={subcategories}
              onCatalogItemCreated={(item) => setCatalog((prev) => [...prev, item])}
              onPatientUpdated={(dental_chart) => setAdmission((prev) => ({ ...prev, patients: { ...prev.patients, dental_chart } }))}
              onAdmissionUpdated={loadAdmission}
            />
            <section id="vaccination" className="card" aria-label="Vaccination">
              <h3>
                Vaccinations
                {vac.vaccinations.length === 0 && <span className="heading-hint"> — No vaccinations recorded yet.</span>}
              </h3>
              {vac.vaccinations.length > 0 && (
                <VaccinationHistory vaccinations={vac.vaccinations} onDelete={vac.deleteVaccination} />
              )}
              <VaccinationForm {...vac} species={admission.patients?.species} staff={staff} />
            </section>
          </section>

          {patientHistorySection}
          {consentFormsSection}
        </>
      ) : (
        <>
      <div className="hospitalization-actions" role="group" aria-label="Hospitalization actions">
        {admission.status === 'admitted' && (
          <button type="button" className="button-link" onClick={discharge}>Discharge</button>
        )}
        <button type="button" className={`button-link${invoiceInfo ? ' button-link-invoice' : ''}`} onClick={createInvoice} disabled={creatingInvoice}
          title={invoiceInfo ? `Open the invoice (${invoiceInfo.status}), syncing in anything new from the worksheet` : 'Create an invoice from the medications, goods and services in this worksheet'}>
          {creatingInvoice ? 'Saving…' : invoiceInfo ? `Invoiced (${invoiceInfo.status})` : 'Invoice'}
        </button>
        <button type="button" className="button-link" onClick={downloadSummaryPdf} title="Download the summary PDF">Summary</button>
        <button type="button" className="button-link" onClick={shareViaWhatsApp} title="Open WhatsApp, then attach the downloaded summary PDF">Share</button>
        <button type="button" className="button-link" onClick={copyPortalLink} title="Copy the live care-update link">
          {linkCopied ? 'Copied!' : 'Copy'}
        </button>
        {admission.originating_visit_id ? (
          <a className="button-link button-link-consult" href={`/consults/${admission.originating_visit_id}`}>Consult</a>
        ) : (
          <button type="button" className="button-link" onClick={addConsult} disabled={addingConsult}
            title="Most day procedures don't need one — only add this if you also want to write up an exam/consult note">
            {addingConsult ? 'Adding…' : 'Add Consult'}
          </button>
        )}
        {addConsultError && <span className="error" role="alert">{addConsultError}</span>}
        <button type="button" className="button-link report-overview-pill" onClick={() => setReportsOpen((v) => !v)}>
          📑 {reportsOpen ? 'Hide Reports' : 'Reports'}
        </button>
        <a className="button-link" href="/hospitalization">Cage Layout</a>
      </div>
      {invoiceError && <p className="error" role="alert">{invoiceError}</p>}

      {reportsOpen && (
        <section className="case-files-open" aria-label="Reports">
          <PatientReportOverview patientId={admission.patient_id} title="Earlier reports for this patient" />
          <HospitalizationReportsSection
            hospitalizationId={id}
            admission={admission}
            staff={staff}
            catalog={catalog}
            subcategories={subcategories}
            onCatalogItemCreated={(item) => setCatalog((prev) => [...prev, item])}
            onPatientUpdated={(dental_chart) => setAdmission((prev) => ({ ...prev, patients: { ...prev.patients, dental_chart } }))}
            onAdmissionUpdated={loadAdmission}
          />
        </section>
      )}

      {patientHistorySection}
      {consentFormsSection}

      <DayTreatmentPlan
        key={`${id}-${noteDeleteVersion}`}
        hospitalizationId={id}
        staff={staff}
        catalog={catalog}
        subcategories={subcategories}
        onCatalogItemCreated={(item) => setCatalog((prev) => [...prev, item])}
      />
      <div className="split">
      <div className="split-main">
      <h2>Day-to-day Worksheet</h2>
      {notes.length === 0 && <p>No entries yet.</p>}
      {groupNotesByDate(notes).map((group) => {
        const dayItems = group.entries
          .flatMap((n) => n.treatment_items || [])
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const dayExpanded = expandedDay === group.date;
        return (
        <div key={group.date} className="worksheet-day">
          <h3 className="worksheet-day-header">
            <button type="button" className="worksheet-day-toggle" onClick={() => toggleDay(group.date)}>
              <span className={`worksheet-day-caret${dayExpanded ? ' worksheet-day-caret-open' : ''}`}>▶</span>
              {formatDayHeader(group.date)}{' '}
              <span className="worksheet-day-count">
                {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
                {dayItems.length > 0 && ` · ${dayItems.length} medication${dayItems.length === 1 ? '' : 's'}`}
              </span>
            </button>
          </h3>

          {dayExpanded && (
            <div className="day-med-panel">
              <h4>Medications logged {formatDayHeader(group.date).toLowerCase()}</h4>
              {dayItems.length === 0 ? (
                <p className="visit-meta">No medications logged yet for this day.</p>
              ) : (
                <ul className="worksheet-entry-items">
                  {dayItems.map((t) =>
                    editingItemId === t.id ? (
                      <li key={t.id} className="day-med-editing">
                        <strong>{t.goods_services?.name}</strong>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Quantity"
                          value={itemEditForm.quantity}
                          onChange={(e) => setItemEditForm({ ...itemEditForm, quantity: e.target.value })}
                        />
                        <input
                          placeholder="Instructions"
                          value={itemEditForm.instructions}
                          onChange={(e) => setItemEditForm({ ...itemEditForm, instructions: e.target.value })}
                        />
                        <button type="button" disabled={savingItemEdit} onClick={() => saveEditItem(t.id)}>
                          {savingItemEdit ? 'Saving...' : 'Save'}
                        </button>
                        <button type="button" onClick={cancelEditItem}>
                          Cancel
                        </button>
                      </li>
                    ) : (
                      <li key={t.id}>
                        {t.goods_services?.name}
                        {t.quantity > 1 ? ` ×${t.quantity}` : ''}
                        {t.instructions && ` — ${t.instructions}`}
                        {t.administration_method && ` (${ADMINISTRATION_METHOD_LABELS[t.administration_method]})`}
                        <span className="visit-meta"> · {formatTime(t.created_at)}</span>
                        <button type="button" onClick={() => startEditItem(t)}>
                          Edit
                        </button>
                        <button type="button" onClick={() => deleteTreatmentItem(t.id)}>
                          Remove
                        </button>
                      </li>
                    )
                  )}
                </ul>
              )}

              <div className="day-med-add">
                <CatalogPicker
                  catalog={catalog}
                  subcategories={subcategories}
                  value={dayAddForm.goods_service_id}
                  onChange={(value) => setDayAddForm({ ...dayAddForm, goods_service_id: value })}
                  onItemCreated={(item) => setCatalog((prev) => [...prev, item])}
                  onCategoryChange={setDayAddCategory}
                />
                {selectedDayAddItem?.administration_method === 'injectable' && (
                  <AdministrationRoutePicker
                    value={dayAddForm.administration_method}
                    onChange={(value) => setDayAddForm({ ...dayAddForm, administration_method: value })}
                  />
                )}
                <input
                  placeholder="Instructions (dosage, frequency, duration)"
                  value={dayAddForm.instructions}
                  onChange={(e) => setDayAddForm({ ...dayAddForm, instructions: e.target.value })}
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Quantity"
                  value={dayAddForm.quantity}
                  onChange={(e) => setDayAddForm({ ...dayAddForm, quantity: e.target.value })}
                />
                <button
                  type="button"
                  disabled={
                    dayAddSubmitting ||
                    (selectedDayAddItem?.administration_method === 'injectable' && !dayAddForm.administration_method)
                  }
                  onClick={() => addDayMedication(group.entries)}
                >
                  {dayAddSubmitting ? 'Adding...' : '+ Add'}
                </button>
                <InfoHint>Attaches to the most recent entry logged this day.</InfoHint>
              </div>
            </div>
          )}

          {group.entries.map((n) => (
            <div key={n.id} className="visit-card">
              <div className="visit-header">
                <strong>{formatTime(n.created_at)}</strong>
                <span>{n.staff?.full_name || 'unassigned'}</span>
              </div>
              {editingNoteId === n.id ? (
                <div className="worksheet-entry-edit">
                  <label className="worksheet-entry-edit-field">
                    Date
                    <input
                      type="date"
                      value={editNoteForm.note_date}
                      onChange={(e) => setEditNoteForm({ ...editNoteForm, note_date: e.target.value })}
                    />
                  </label>
                  <label className="worksheet-entry-edit-field">
                    Logged by
                    <select
                      value={editNoteForm.author_id}
                      onChange={(e) => setEditNoteForm({ ...editNoteForm, author_id: e.target.value })}
                    >
                      <option value="">Unassigned</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {/* The whole tile-based check-in field set (drinking/
                      stool/urine/vomit/mood/temperature feel/medication/
                      force-feeding) only applies to a cleaner's Quick
                      Check-In entry, and isn't editable here — the
                      client-facing text below is the single source of
                      truth for what the owner sees, and editing these
                      raw values wouldn't update that text, silently
                      leaving it wrong. Correct the text directly instead. */}
                  {hasCheckinData(n) && (
                    <label className="client-summary-edit-label">
                      What the owner sees on the portal
                      <textarea
                        rows={3}
                        value={editNoteForm.client_summary}
                        onChange={(e) => setEditNoteForm({ ...editNoteForm, client_summary: e.target.value })}
                      />
                    </label>
                  )}
                  <label className="worksheet-entry-edit-field">
                    Weight (kg)
                    <input
                      type="number"
                      step="0.01"
                      value={editNoteForm.weight_kg}
                      onChange={(e) => setEditNoteForm({ ...editNoteForm, weight_kg: e.target.value })}
                    />
                  </label>
                  <label className="worksheet-entry-edit-field">
                    Temperature (°C)
                    <input
                      type="number"
                      step="0.1"
                      value={editNoteForm.temperature_c}
                      onChange={(e) => setEditNoteForm({ ...editNoteForm, temperature_c: e.target.value })}
                    />
                  </label>
                  <label className="worksheet-entry-edit-field">
                    Notes
                    <textarea
                      rows={2}
                      value={editNoteForm.notes}
                      onChange={(e) => setEditNoteForm({ ...editNoteForm, notes: e.target.value })}
                    />
                  </label>

                  <div className="worksheet-entry-edit-field">
                    Medications / Services / Diagnostics
                    {n.treatment_items?.length > 0 && (
                      <ul className="worksheet-entry-items">
                        {n.treatment_items.map((t) =>
                          editingItemId === t.id ? (
                            <li key={t.id} className="day-med-editing">
                              <strong>{t.goods_services?.name}</strong>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="Quantity"
                                value={itemEditForm.quantity}
                                onChange={(e) => setItemEditForm({ ...itemEditForm, quantity: e.target.value })}
                              />
                              <input
                                placeholder="Instructions"
                                value={itemEditForm.instructions}
                                onChange={(e) => setItemEditForm({ ...itemEditForm, instructions: e.target.value })}
                              />
                              <button type="button" disabled={savingItemEdit} onClick={() => saveEditItem(t.id)}>
                                {savingItemEdit ? 'Saving...' : 'Save'}
                              </button>
                              <button type="button" onClick={cancelEditItem}>
                                Cancel
                              </button>
                            </li>
                          ) : (
                            <li key={t.id}>
                              {t.goods_services?.name}
                              {t.quantity > 1 ? ` ×${t.quantity}` : ''}
                              {t.instructions && ` — ${t.instructions}`}
                              <button type="button" onClick={() => startEditItem(t)}>
                                Edit
                              </button>
                              <button type="button" onClick={() => deleteTreatmentItem(t.id)}>
                                Remove
                              </button>
                            </li>
                          )
                        )}
                      </ul>
                    )}

                    <div className="day-med-add">
                      <CatalogPicker
                        catalog={catalog}
                        subcategories={subcategories}
                        value={noteAddItemForm.goods_service_id}
                        onChange={(value) => setNoteAddItemForm({ ...noteAddItemForm, goods_service_id: value })}
                        onItemCreated={(item) => setCatalog((prev) => [...prev, item])}
                        onCategoryChange={setNoteAddCategory}
                      />
                      {selectedNoteAddItem?.administration_method === 'injectable' && (
                        <AdministrationRoutePicker
                          value={noteAddItemForm.administration_method}
                          onChange={(value) => setNoteAddItemForm({ ...noteAddItemForm, administration_method: value })}
                        />
                      )}
                      <input
                        placeholder="Instructions (dosage, frequency, duration)"
                        value={noteAddItemForm.instructions}
                        onChange={(e) => setNoteAddItemForm({ ...noteAddItemForm, instructions: e.target.value })}
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Quantity"
                        value={noteAddItemForm.quantity}
                        onChange={(e) => setNoteAddItemForm({ ...noteAddItemForm, quantity: e.target.value })}
                      />
                      <button
                        type="button"
                        disabled={
                          noteAddItemSubmitting ||
                          (selectedNoteAddItem?.administration_method === 'injectable' && !noteAddItemForm.administration_method)
                        }
                        onClick={() => addItemToNote(n.id)}
                      >
                        {noteAddItemSubmitting ? 'Adding...' : '+ Add'}
                      </button>
                    </div>
                  </div>

                  {editNoteError && <p className="error" role="alert">{editNoteError}</p>}
                  <div className="worksheet-entry-edit-actions">
                    <button type="button" disabled={savingEditNote || deletingNote} onClick={() => saveEditNote(n.id)}>
                      {savingEditNote ? 'Saving...' : 'Save'}
                    </button>
                    <button type="button" disabled={savingEditNote || deletingNote} onClick={cancelEditNote}>
                      Cancel
                    </button>
                    <button type="button" disabled={savingEditNote || deletingNote} onClick={() => deleteNote(n.id)}>
                      {deletingNote ? 'Deleting…' : 'Delete entry'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
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
                  {hasCheckinData(n) && (
                    <p className="client-summary-view">
                      {n.client_summary || buildEmpathicCheckinText(n, admission?.patients?.name)}
                    </p>
                  )}
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
                  <button type="button" className="reason-edit-btn" onClick={() => startEditNote(n)}>
                    Edit
                  </button>
                  <AttachmentSection entityType="hospitalization_note" entityId={n.id} />
                </>
              )}
            </div>
          ))}
        </div>
        );
      })}
      </div>

      <div className="split-aside">
      <details className="case-files">
        <summary>📎 Case Photos &amp; Files</summary>
        <p className="visit-meta">
          Not tied to a single worksheet entry — admission photo, wound progress, etc.
        </p>
        <AttachmentSection entityType="hospitalization" entityId={id} refreshKey={noteDeleteVersion} />
      </details>

      <form className="card" onSubmit={addNote}>
        <h3>
          Add Worksheet Entry{' '}
          <InfoHint>
            Record an observation and Claude will break it down and fill in Weight, Temperature,
            and Notes below — anything already filled in is kept. Medications or tests you mention
            are matched against the catalog and added to the list below automatically when a
            confident match is found.
          </InfoHint>
        </h3>
        <AudioRecorder entityType="hospitalization" entityId={id} onExtractedFields={applyExtractedFields} />
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
                  {p.administration_method && ` (${ADMINISTRATION_METHOD_LABELS[p.administration_method]})`}
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
            onCategoryChange={setPendingItemCategory}
          />
          {selectedPendingItem?.administration_method === 'injectable' && (
            <AdministrationRoutePicker
              value={pendingItemForm.administration_method}
              onChange={(value) => setPendingItemForm({ ...pendingItemForm, administration_method: value })}
            />
          )}
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
          <button
            type="button"
            className="secondary"
            onClick={addPendingItem}
            disabled={selectedPendingItem?.administration_method === 'injectable' && !pendingItemForm.administration_method}
          >
            + Add
          </button>
        </fieldset>

        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Add'}
        </button>
      </form>
      </div>
      </div>
        </>
      )}

      <PdfPreviewModal url={previewPdfUrl} onClose={() => setPreviewPdfUrl(null)} />
    </div>
  );
}
