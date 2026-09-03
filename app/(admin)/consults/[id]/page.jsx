// app/consults/[id]/page.jsx
// The full consult "file": vitals/exam record, live notes, diagnostics
// (with file attachments), a treatment plan drawn from the catalog, and
// links out to surgical/dental reports and hospitalization admission.

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AttachmentSection from '@/app/_components/AttachmentSection';
import AudioRecorder from '@/app/_components/AudioRecorder';
import VoiceToTextButton from '@/app/_components/VoiceToTextButton';
import { useVaccinations } from '@/app/_components/useVaccinations';
import VaccinationForm from '@/app/_components/VaccinationForm';
import VaccinationHistory from '@/app/_components/VaccinationHistory';
import { usePatientAlerts } from '@/app/_components/usePatientAlerts';
import PatientAlerts from '@/app/_components/PatientAlerts';
import CatalogPicker from '@/app/_components/CatalogPicker';
import AdministrationMethodSelect, {
  ADMINISTRATION_METHOD_LABELS,
} from '@/app/_components/AdministrationMethodSelect';
import { subcategoryName } from '@/lib/catalogGrouping';
import { CONSENT_FORM_TYPES, CONSENT_FORM_LABELS, buildConsentFormText } from '@/lib/consentTemplates';
import { printPdfUrl } from '@/lib/printPdf';

// Diagnostics predating migration 023 have a free-text type instead of a
// catalog link — kept only to label those old rows.
const LEGACY_DIAGNOSTIC_TYPE_LABELS = {
  blood_test: 'Blood test',
  xray: 'X-ray',
  ultrasound: 'Ultrasound',
  other: 'Other',
};

function truncate(str, max = 160) {
  const s = str.trim();
  return s.length > max ? `${s.slice(0, max).trim()}…` : s;
}

export default function ConsultDetailPage() {
  const { id } = useParams();
  const router = useRouter();

  const [consult, setConsult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [subcategories, setSubcategories] = useState([]);

  const [record, setRecord] = useState(null);
  const [savingRecord, setSavingRecord] = useState(false);
  const [recordError, setRecordError] = useState(null);

  const [diagnostics, setDiagnostics] = useState([]);
  const [diagForm, setDiagForm] = useState({ goods_service_id: '', description: '', result: '' });
  const [diagError, setDiagError] = useState(null);

  const [treatmentItems, setTreatmentItems] = useState([]);
  const [treatForm, setTreatForm] = useState({
    goods_service_id: '',
    instructions: '',
    quantity: '1',
    administration_method: '',
  });

  const [surgicalReports, setSurgicalReports] = useState([]);
  const [surgForm, setSurgForm] = useState({ surgeon_id: '', procedure_name: '', notes: '' });

  const [dentalReports, setDentalReports] = useState([]);
  const [dentalForm, setDentalForm] = useState({
    performed_by: '',
    findings: '',
    procedures_performed: '',
    notes: '',
  });

  const [consentForms, setConsentForms] = useState([]);
  const [consentForm, setConsentForm] = useState({
    form_type: '',
    signed_by_name: '',
    signed_by_relationship: '',
    staff_witness_id: '',
  });
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [consentError, setConsentError] = useState(null);

  const [hospReason, setHospReason] = useState('');
  const [admitting, setAdmitting] = useState(false);

  const [invoiceInfo, setInvoiceInfo] = useState(null); // { id, status } of the active invoice, if any
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  const [previousVisits, setPreviousVisits] = useState([]);

  const loadConsult = () =>
    fetch(`/api/visits/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setConsult(data);
        setRecord({
          weight_kg: data.weight_kg ?? data.patients?.current_weight_kg ?? '',
          temperature_c: data.temperature_c ?? '',
          body_condition_score: data.body_condition_score ?? '',
          anamnesis: data.anamnesis ?? '',
          findings: data.findings ?? '',
          diagnosis: data.diagnosis ?? '',
          prognosis: data.prognosis ?? '',
          treatment_notes: data.treatment_notes ?? '',
        });
        setLoading(false);
      });

  const loadDiagnostics = () =>
    fetch(`/api/diagnostics?visit_id=${id}`)
      .then((res) => res.json())
      .then((data) => setDiagnostics(Array.isArray(data) ? data : []));

  const loadTreatmentItems = () =>
    fetch(`/api/treatment-items?visit_id=${id}`)
      .then((res) => res.json())
      .then((data) => setTreatmentItems(Array.isArray(data) ? data : []));

  const loadSurgicalReports = () =>
    fetch(`/api/surgical-reports?visit_id=${id}`)
      .then((res) => res.json())
      .then((data) => setSurgicalReports(Array.isArray(data) ? data : []));

  const loadDentalReports = () =>
    fetch(`/api/dental-reports?visit_id=${id}`)
      .then((res) => res.json())
      .then((data) => setDentalReports(Array.isArray(data) ? data : []));

  const loadInvoiceInfo = () =>
    fetch(`/api/invoices?visit_id=${id}`)
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setInvoiceInfo(list.find((inv) => inv.status !== 'void') || null);
      });

  const loadConsentForms = () =>
    fetch(`/api/consent-forms?visit_id=${id}`)
      .then((res) => res.json())
      .then((data) => setConsentForms(Array.isArray(data) ? data : []));

  useEffect(() => {
    loadConsult();
    loadDiagnostics();
    loadTreatmentItems();
    loadSurgicalReports();
    loadDentalReports();
    loadInvoiceInfo();
    loadConsentForms();

    Promise.all([
      fetch('/api/staff').then((res) => res.json()),
      fetch('/api/rooms').then((res) => res.json()),
      fetch('/api/goods-services?active=true').then((res) => res.json()),
      fetch('/api/catalog-subcategories').then((res) => res.json()),
    ]).then(([staffData, roomsData, catalogData, subcategoriesData]) => {
      setStaff(Array.isArray(staffData) ? staffData : []);
      setRooms(Array.isArray(roomsData) ? roomsData : []);
      setCatalog(Array.isArray(catalogData) ? catalogData : []);
      setSubcategories(Array.isArray(subcategoriesData) ? subcategoriesData : []);
    });

    const channel = supabase
      .channel(`consult-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits', filter: `id=eq.${id}` }, loadConsult)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'diagnostics', filter: `visit_id=eq.${id}` }, loadDiagnostics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'treatment_items', filter: `visit_id=eq.${id}` }, loadTreatmentItems)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recordings', filter: `entity_id=eq.${id}` },
        () => {
          // A recording finishing is what fills in the fields above (and
          // possibly Diagnostics/Treatment Plan) — reload all three
          // directly rather than relying only on postgres_changes on
          // visits/diagnostics/treatment_items picking it up.
          loadConsult();
          loadDiagnostics();
          loadTreatmentItems();
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'surgical_reports', filter: `visit_id=eq.${id}` }, loadSurgicalReports)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dental_reports', filter: `visit_id=eq.${id}` }, loadDentalReports)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices', filter: `visit_id=eq.${id}` }, loadInvoiceInfo)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'consent_forms', filter: `visit_id=eq.${id}` }, loadConsentForms)
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!consult?.patient_id) return;
    fetch(`/api/visits?patient_id=${consult.patient_id}&status=complete`)
      .then((res) => res.json())
      .then((data) => {
        const list = (Array.isArray(data) ? data : [])
          .filter((v) => v.id !== id)
          .sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
        setPreviousVisits(list);
      });
  }, [consult?.patient_id, id]);

  function appendRecordField(field, text) {
    setRecord((prev) => ({ ...prev, [field]: prev[field] ? `${prev[field]}\n${text}` : text }));
  }

  function appendSurgNotes(text) {
    setSurgForm((prev) => ({ ...prev, notes: prev.notes ? `${prev.notes}\n${text}` : text }));
  }

  function appendDentalNotes(text) {
    setDentalForm((prev) => ({ ...prev, notes: prev.notes ? `${prev.notes}\n${text}` : text }));
  }

  async function saveRecord(e) {
    e.preventDefault();
    setSavingRecord(true);
    setRecordError(null);

    const payload = {
      weight_kg: record.weight_kg === '' ? null : Number(record.weight_kg),
      temperature_c: record.temperature_c === '' ? null : Number(record.temperature_c),
      body_condition_score: record.body_condition_score === '' ? null : Number(record.body_condition_score),
      anamnesis: record.anamnesis,
      findings: record.findings,
      diagnosis: record.diagnosis,
      prognosis: record.prognosis,
      treatment_notes: record.treatment_notes,
    };

    const res = await fetch(`/api/visits/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setRecordError(data.error || 'Failed to save consult record');
    } else {
      loadConsult();
    }
    setSavingRecord(false);
  }

  async function completeConsult() {
    await fetch(`/api/visits/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'complete' }),
    });
    loadConsult();
  }

  async function deleteConsult() {
    if (!confirm('Delete this consult? This cannot be undone.')) return;
    const res = await fetch(`/api/visits/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Failed to delete consult');
    } else {
      router.push('/consults');
    }
  }

  async function addDiagnostic(e) {
    e.preventDefault();
    if (!diagForm.goods_service_id) return;
    setDiagError(null);
    const res = await fetch('/api/diagnostics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: id, ...diagForm }),
    });
    const data = await res.json();
    if (!res.ok) {
      setDiagError(data.error || 'Failed to add diagnostic');
      return;
    }
    setDiagForm({ goods_service_id: '', description: '', result: '' });
    loadDiagnostics();
    loadTreatmentItems();
  }

  async function deleteDiagnostic(diagId) {
    await fetch(`/api/diagnostics/${diagId}`, { method: 'DELETE' });
    loadDiagnostics();
    loadTreatmentItems();
  }

  async function addTreatmentItem(e) {
    e.preventDefault();
    if (!treatForm.goods_service_id) return;
    await fetch('/api/treatment-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: id, ...treatForm }),
    });
    setTreatForm({ goods_service_id: '', instructions: '', quantity: '1', administration_method: '' });
    loadTreatmentItems();
  }

  async function addConsentForm(e) {
    e.preventDefault();
    if (!consentForm.form_type || !consentForm.signed_by_name.trim()) return;
    setConsentSubmitting(true);
    setConsentError(null);

    const res = await fetch('/api/consent-forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: id, ...consentForm }),
    });
    const data = await res.json();

    if (!res.ok) {
      setConsentError(data.error || 'Failed to save consent form');
    } else {
      setConsentForm({ form_type: '', signed_by_name: '', signed_by_relationship: '', staff_witness_id: '' });
      loadConsentForms();
      printPdfUrl(`/api/consent-forms/${data.id}/pdf`);
    }
    setConsentSubmitting(false);
  }

  async function deleteTreatmentItem(itemId) {
    await fetch(`/api/treatment-items/${itemId}`, { method: 'DELETE' });
    loadTreatmentItems();
  }

  async function addSurgicalReport(e) {
    e.preventDefault();
    await fetch('/api/surgical-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: id, ...surgForm }),
    });
    setSurgForm({ surgeon_id: '', procedure_name: '', notes: '' });
    loadSurgicalReports();
  }

  async function addDentalReport(e) {
    e.preventDefault();
    await fetch('/api/dental-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: id, ...dentalForm }),
    });
    setDentalForm({ performed_by: '', findings: '', procedures_performed: '', notes: '' });
    loadDentalReports();
  }

  async function createInvoice() {
    setCreatingInvoice(true);
    const res = await fetch(`/api/visits/${id}/invoice`, { method: 'POST' });
    const data = await res.json();
    setCreatingInvoice(false);
    if (res.ok) {
      router.push(`/invoices/${data.id}`);
    }
  }

  async function admitToHospital(e) {
    e.preventDefault();
    setAdmitting(true);
    const res = await fetch('/api/hospitalizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originating_visit_id: id, reason: hospReason }),
    });
    const data = await res.json();
    setAdmitting(false);
    if (res.ok) {
      router.push(`/hospitalization/${data.id}`);
    }
  }

  const vac = useVaccinations(consult?.patients?.id, consult?.patients?.species);
  const patientAlerts = usePatientAlerts(consult?.patients?.id);

  if (loading || !consult || !record) return <p>Loading consult...</p>;
  if (consult.error) return <p>Consult not found.</p>;

  const vets = staff.filter((s) => s.role === 'vet');

  return (
    <div>
      <p>
        <a href="/consults">&larr; All consults</a>
      </p>
      <h1>
        {consult.patients?.name}{' '}
        <span>
          ({consult.patients?.species}) — {consult.status}
        </span>
      </h1>
      <p>
        Owner: <a href={`/clients/${consult.clients?.id}`}>{consult.clients?.full_name}</a> ·
        Patient: <a href={`/patients/${consult.patients?.id}`}>record</a> · Room:{' '}
        {consult.rooms?.name} · Vet: {consult.staff?.full_name || 'unassigned'}
      </p>

      {(patientAlerts.alerts.length > 0 || consult?.patients?.id) && (
        <details className="patient-alerts-panel" open={patientAlerts.alerts.length > 0}>
          <summary>
            ⚠️ Long-Term Patient Notes {patientAlerts.alerts.length > 0 && `(${patientAlerts.alerts.length})`}
          </summary>
          <PatientAlerts {...patientAlerts} staff={staff} />
        </details>
      )}

      {previousVisits.length > 0 && (
        <details className="consult-history-panel">
          <summary>🕓 Previous Consults ({previousVisits.length})</summary>
          <ul className="consult-history-list">
            {previousVisits.map((v) => (
              <li key={v.id} className="consult-history-item">
                <p className="visit-meta">
                  <a href={`/consults/${v.id}`}>{new Date(v.started_at).toLocaleDateString()}</a>
                  {v.staff?.full_name && ` · ${v.staff.full_name}`}
                </p>
                {v.anamnesis && (
                  <p>
                    <strong>Anamnesis:</strong> {truncate(v.anamnesis)}
                  </p>
                )}
                {v.findings && (
                  <p>
                    <strong>Findings:</strong> {truncate(v.findings)}
                  </p>
                )}
                {v.treatment_notes && (
                  <p>
                    <strong>Treatment:</strong> {truncate(v.treatment_notes)}
                  </p>
                )}
                {!v.anamnesis && !v.findings && !v.treatment_notes && (
                  <p className="note-empty">No record notes for this consult.</p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {consult.status === 'in_progress' && (
        <button type="button" onClick={completeConsult}>
          Complete Consult
        </button>
      )}{' '}
      <button type="button" onClick={deleteConsult}>
        Delete Consult
      </button>

      <div className="two-col">
      <div>
      <h2>Vitals & Exam</h2>
      <form className="card" onSubmit={saveRecord}>
        {recordError && <p className="error">{recordError}</p>}
        <label>
          Weight (kg)
          <input
            type="number"
            step="0.01"
            value={record.weight_kg}
            onChange={(e) => setRecord({ ...record, weight_kg: e.target.value })}
          />
        </label>
        <label>
          Temperature (°C)
          <input
            type="number"
            step="0.1"
            value={record.temperature_c}
            onChange={(e) => setRecord({ ...record, temperature_c: e.target.value })}
          />
        </label>
        <label>
          Body condition score (1–9)
          <input
            type="number"
            min="1"
            max="9"
            value={record.body_condition_score}
            onChange={(e) => setRecord({ ...record, body_condition_score: e.target.value })}
          />
        </label>
        <label>
          <span className="field-label-row">
            Anamnesis (history / owner-reported complaint)
            <VoiceToTextButton
              kind="anamnesis"
              onResult={(text) => appendRecordField('anamnesis', text)}
            />
          </span>
          <textarea
            rows={2}
            value={record.anamnesis}
            onChange={(e) => setRecord({ ...record, anamnesis: e.target.value })}
          />
        </label>
        <label>
          <span className="field-label-row">
            Findings (physical exam)
            <VoiceToTextButton
              kind="findings"
              onResult={(text) => appendRecordField('findings', text)}
            />
          </span>
          <textarea
            rows={2}
            value={record.findings}
            onChange={(e) => setRecord({ ...record, findings: e.target.value })}
          />
        </label>
        <label>
          <span className="field-label-row">
            Diagnosis
            <VoiceToTextButton
              kind="diagnosis"
              onResult={(text) => appendRecordField('diagnosis', text)}
            />
          </span>
          <textarea
            rows={2}
            value={record.diagnosis}
            onChange={(e) => setRecord({ ...record, diagnosis: e.target.value })}
          />
        </label>
        <label>
          Prognosis
          <textarea
            rows={2}
            value={record.prognosis}
            onChange={(e) => setRecord({ ...record, prognosis: e.target.value })}
          />
        </label>
        <label>
          <span className="field-label-row">
            Treatment plan notes
            <VoiceToTextButton
              kind="treatment_notes"
              onResult={(text) => appendRecordField('treatment_notes', text)}
            />
          </span>
          <textarea
            rows={2}
            value={record.treatment_notes}
            onChange={(e) => setRecord({ ...record, treatment_notes: e.target.value })}
          />
        </label>
        <button type="submit" disabled={savingRecord}>
          {savingRecord ? 'Saving...' : 'Save Record'}
        </button>
      </form>

      <h3>Record Consult</h3>
      <p className="visit-meta">
        Record the consult and Claude will break it down and fill in the Anamnesis, Findings,
        Diagnosis, Prognosis, and Treatment plan fields above — anything already filled in is
        kept, with the recording's version appended below it. Diagnostic tests and medications you
        mention are also matched against the catalog and added to the Diagnostics and Treatment
        Plan lists below automatically when a confident match is found.
      </p>
      <AudioRecorder entityType="visit" entityId={id} />

      <h3>Diagnostics</h3>
      {diagnostics.map((d) => (
        <div key={d.id} className="visit-card">
          <div className="visit-header">
            <strong>
              {d.goods_service_id
                ? catalog.find((c) => c.id === d.goods_service_id)?.name || 'Test'
                : LEGACY_DIAGNOSTIC_TYPE_LABELS[d.type] || d.type}
            </strong>
            <button type="button" onClick={() => deleteDiagnostic(d.id)}>
              Remove
            </button>
          </div>
          {d.description && <p>{d.description}</p>}
          {d.result && (
            <p>
              <strong>Result:</strong> {d.result}
            </p>
          )}
          <AttachmentSection entityType="diagnostic" entityId={d.id} />
        </div>
      ))}
      <form className="card" onSubmit={addDiagnostic}>
        <h3>Add Diagnostic</h3>
        {diagError && <p className="error">{diagError}</p>}
        <CatalogPicker
          catalog={catalog}
          subcategories={subcategories}
          value={diagForm.goods_service_id}
          onChange={(value) => setDiagForm({ ...diagForm, goods_service_id: value })}
          onItemCreated={(item) => setCatalog((prev) => [...prev, item])}
          fixedMainCategory="test"
        />
        <input
          placeholder="Description (what was ordered — e.g. left front leg)"
          value={diagForm.description}
          onChange={(e) => setDiagForm({ ...diagForm, description: e.target.value })}
        />
        <input
          placeholder="Result"
          value={diagForm.result}
          onChange={(e) => setDiagForm({ ...diagForm, result: e.target.value })}
        />
        <button type="submit">Add Diagnostic</button>
        <p className="visit-meta">
          Also adds this test to the Treatment Plan, ready to invoice. Upload blood work PDFs,
          x-rays, or ultrasound scans on each entry above once it's added.
        </p>
      </form>

      <h3>Treatment Plan</h3>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Instructions</th>
            <th>Qty</th>
            <th>Given</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {treatmentItems.length === 0 && (
            <tr>
              <td colSpan={5}>No treatment items yet.</td>
            </tr>
          )}
          {treatmentItems.map((t) => (
            <tr key={t.id}>
              <td>
                {t.goods_services?.name}
                {subcategoryName(subcategories, t.goods_services?.subcategory_id) &&
                  ` (${subcategoryName(subcategories, t.goods_services?.subcategory_id)})`}
              </td>
              <td>{t.instructions}</td>
              <td>{t.quantity}</td>
              <td>{t.administration_method ? ADMINISTRATION_METHOD_LABELS[t.administration_method] : '—'}</td>
              <td>
                <button type="button" onClick={() => deleteTreatmentItem(t.id)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="card" onSubmit={addTreatmentItem}>
        <h3>Add Treatment Item</h3>
        <CatalogPicker
          catalog={catalog}
          subcategories={subcategories}
          value={treatForm.goods_service_id}
          onChange={(value) => setTreatForm({ ...treatForm, goods_service_id: value, administration_method: '' })}
          onItemCreated={(item) => setCatalog((prev) => [...prev, item])}
        />
        <AdministrationMethodSelect
          catalogItem={catalog.find((c) => c.id === treatForm.goods_service_id)}
          value={treatForm.administration_method}
          onChange={(value) => setTreatForm({ ...treatForm, administration_method: value })}
        />
        <input
          placeholder="Instructions (dosage, frequency, duration)"
          value={treatForm.instructions}
          onChange={(e) => setTreatForm({ ...treatForm, instructions: e.target.value })}
        />
        <input
          type="number"
          step="0.01"
          placeholder="Quantity"
          value={treatForm.quantity}
          onChange={(e) => setTreatForm({ ...treatForm, quantity: e.target.value })}
        />
        <button type="submit">Add to Plan</button>
      </form>

      <h3>Invoice</h3>
      {invoiceInfo ? (
        <p>
          <a href={`/invoices/${invoiceInfo.id}`}>View Invoice</a> ({invoiceInfo.status})
        </p>
      ) : (
        <>
          <button type="button" onClick={createInvoice} disabled={creatingInvoice}>
            {creatingInvoice ? 'Creating...' : '🧾 Create Invoice from Treatment Plan'}
          </button>
          <p className="visit-meta">
            Opens a new invoice and imports every item above as a line item. You can still add
            more items on the invoice itself afterward.
          </p>
        </>
      )}
      </div>

      <div>
      <h2>Vaccinations</h2>
      <VaccinationHistory vaccinations={vac.vaccinations} onDelete={vac.deleteVaccination} />
      <VaccinationForm {...vac} species={consult.patients?.species} staff={staff} />
      </div>
      </div>

      <h2>Consent Forms</h2>
      {consentForms.length === 0 && <p>No consent forms signed yet.</p>}
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
        <h3>Sign a Consent Form</h3>
        {consentError && <p className="error">{consentError}</p>}
        <select
          required
          value={consentForm.form_type}
          onChange={(e) => setConsentForm({ ...consentForm, form_type: e.target.value })}
        >
          <option value="">Select consent form...</option>
          {CONSENT_FORM_TYPES.filter((t) => t !== 'hospitalization').map((t) => (
            <option key={t} value={t}>
              {CONSENT_FORM_LABELS[t]}
            </option>
          ))}
        </select>
        {consentForm.form_type && (
          <div className="consent-text-box">
            {buildConsentFormText(consentForm.form_type, {
              name: consult.patients?.name,
              sex: consult.patients?.sex,
            })}
          </div>
        )}
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

      <div className="two-col">
      <div>
      <h2>Surgical Reports</h2>
      {surgicalReports.map((r) => (
        <div key={r.id} className="visit-card">
          <strong>{r.procedure_name || 'Procedure'}</strong>
          <p>
            {r.staff?.full_name || 'unassigned'} ·{' '}
            {r.performed_at ? new Date(r.performed_at).toLocaleString() : ''}
          </p>
          {r.notes && <p>{r.notes}</p>}
          {r.ai_summary && (
            <p>
              <strong>AI summary:</strong> {r.ai_summary}
            </p>
          )}
          <AttachmentSection entityType="surgical_report" entityId={r.id} />
          <AudioRecorder entityType="surgical_report" entityId={r.id} />
        </div>
      ))}
      <form className="card" onSubmit={addSurgicalReport}>
        <h3>Add Surgical Report</h3>
        <input
          placeholder="Procedure"
          value={surgForm.procedure_name}
          onChange={(e) => setSurgForm({ ...surgForm, procedure_name: e.target.value })}
        />
        <select
          value={surgForm.surgeon_id}
          onChange={(e) => setSurgForm({ ...surgForm, surgeon_id: e.target.value })}
        >
          <option value="">Surgeon...</option>
          {vets.map((v) => (
            <option key={v.id} value={v.id}>
              {v.full_name}
            </option>
          ))}
        </select>
        <label>
          <span className="field-label-row">
            Notes
            <VoiceToTextButton kind="surgical_notes" onResult={appendSurgNotes} />
          </span>
          <textarea
            rows={2}
            value={surgForm.notes}
            onChange={(e) => setSurgForm({ ...surgForm, notes: e.target.value })}
          />
        </label>
        <button type="submit">Add Surgical Report</button>
      </form>
      </div>

      <div>
      <h2>Dental Reports</h2>
      {dentalReports.map((r) => (
        <div key={r.id} className="visit-card">
          <strong>{r.staff?.full_name || 'unassigned'}</strong>
          <p>{r.performed_at ? new Date(r.performed_at).toLocaleString() : ''}</p>
          {r.findings && (
            <p>
              <strong>Findings:</strong> {r.findings}
            </p>
          )}
          {r.procedures_performed && (
            <p>
              <strong>Procedures:</strong> {r.procedures_performed}
            </p>
          )}
          {r.notes && <p>{r.notes}</p>}
          <AttachmentSection entityType="dental_report" entityId={r.id} />
        </div>
      ))}
      <form className="card" onSubmit={addDentalReport}>
        <h3>Add Dental Report</h3>
        <select
          value={dentalForm.performed_by}
          onChange={(e) => setDentalForm({ ...dentalForm, performed_by: e.target.value })}
        >
          <option value="">Performed by...</option>
          {vets.map((v) => (
            <option key={v.id} value={v.id}>
              {v.full_name}
            </option>
          ))}
        </select>
        <input
          placeholder="Findings"
          value={dentalForm.findings}
          onChange={(e) => setDentalForm({ ...dentalForm, findings: e.target.value })}
        />
        <input
          placeholder="Procedures performed"
          value={dentalForm.procedures_performed}
          onChange={(e) => setDentalForm({ ...dentalForm, procedures_performed: e.target.value })}
        />
        <label>
          <span className="field-label-row">
            Notes
            <VoiceToTextButton kind="dental_notes" onResult={appendDentalNotes} />
          </span>
          <textarea
            rows={2}
            value={dentalForm.notes}
            onChange={(e) => setDentalForm({ ...dentalForm, notes: e.target.value })}
          />
        </label>
        <button type="submit">Add Dental Report</button>
      </form>
      </div>
      </div>

      <h2>Hospitalization</h2>
      <form className="card" onSubmit={admitToHospital}>
        <h3>Admit to Hospitalization</h3>
        <input
          placeholder="Reason for admission"
          value={hospReason}
          onChange={(e) => setHospReason(e.target.value)}
        />
        <button type="submit" disabled={admitting}>
          {admitting ? 'Admitting...' : 'Admit'}
        </button>
      </form>
    </div>
  );
}
