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
import AdministrationRoutePicker from '@/app/_components/AdministrationRoutePicker';
import MicrochipCaptureModal from '@/app/_components/MicrochipCaptureModal';
import { isMicrochipProduct } from '@/lib/microchipProduct';
import { isUltrasoundTest } from '@/lib/ultrasoundProduct';
import { isXrayTest } from '@/lib/xrayProduct';
import RecordReports from '@/app/_components/RecordReports';
import { ADMINISTRATION_METHOD_LABELS } from '@/lib/administrationMethods';
import { subcategoryName, ADD_ITEM_LABELS } from '@/lib/catalogGrouping';
import InfoHint from '@/app/_components/InfoHint';
import PatientHistoryPanel from '@/app/_components/PatientHistoryPanel';
import PatientReportOverview from '@/app/_components/PatientReportOverview';
import CrossRecordLinks from '@/app/_components/CrossRecordLinks';

// Diagnostics predating migration 023 have a free-text type instead of a
// catalog link — kept only to label those old rows.
const LEGACY_DIAGNOSTIC_TYPE_LABELS = {
  blood_test: 'Blood test',
  xray: 'X-ray',
  ultrasound: 'Ultrasound',
  other: 'Other',
};

// Groups the consult record into the workflow stages a vet actually moves
// through, instead of the old side-by-side column layout — see the
// activeTab state below for why the inactive tabs stay mounted.
const CONSULT_TABS = [
  { id: 'exam', label: '🩺 Exam, Diagnostics & Treatment' },
  { id: 'vaccinations', label: '💉 Vaccinations' },
  { id: 'reports', label: 'Reports' },
];

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
  const [vetChangeError, setVetChangeError] = useState(null);

  const [diagnostics, setDiagnostics] = useState([]);
  const [diagForm, setDiagForm] = useState({ goods_service_id: '', description: '', result: '' });
  const [diagError, setDiagError] = useState(null);
  const [resultDrafts, setResultDrafts] = useState({});
  const [savingResultId, setSavingResultId] = useState(null);
  const [resultError, setResultError] = useState(null);
  const [reportsError, setReportsError] = useState({});
  const [extractingResultId, setExtractingResultId] = useState(null);
  const [extractResultError, setExtractResultError] = useState({});
  const [diagPhotoVersion, setDiagPhotoVersion] = useState({}); // bumped per-diagnostic to force its AttachmentSection to reload after an external delete

  const [treatmentItems, setTreatmentItems] = useState([]);
  const [treatForm, setTreatForm] = useState({ goods_service_id: '', instructions: '', quantity: '1', administration_method: '' });
  const [treatCategory, setTreatCategory] = useState('product');
  const [microchipModalOpen, setMicrochipModalOpen] = useState(false);

  // Historical surgical/dental reports still show under Reports even though
  // the Procedures tab that used to create new ones (visit_id-scoped) is
  // gone — all surgical/dental work now goes through a Day Procedure
  // booking instead, so it lands on that record's own checklist and shows
  // up here read-only.
  const [surgicalReports, setSurgicalReports] = useState([]);
  const [dentalReports, setDentalReports] = useState([]);

  const [ultrasoundReports, setUltrasoundReports] = useState([]);
  const [dictatingUltrasoundFor, setDictatingUltrasoundFor] = useState(null); // diagnostic id currently starting a report
  const [autoRecordUltrasoundId, setAutoRecordUltrasoundId] = useState(null);
  const [ultrasoundForm, setUltrasoundForm] = useState({}); // diagnostic id -> { performed_by, findings, notes }

  const [xrayReports, setXrayReports] = useState([]);
  const [dictatingXrayFor, setDictatingXrayFor] = useState(null); // diagnostic id currently starting a report
  const [autoRecordXrayId, setAutoRecordXrayId] = useState(null);
  const [xrayForm, setXrayForm] = useState({}); // diagnostic id -> { performed_by, findings, notes }

  // Shared across all four report types' "Generate AI Report" button — only
  // one generation runs at a time, so one set of state is enough to track
  // which report (by id) is in flight or last errored.
  const [generatingReportId, setGeneratingReportId] = useState(null);
  const [generateReportError, setGenerateReportError] = useState(null);
  const [generateReportErrorId, setGenerateReportErrorId] = useState(null);

  const [hospReason, setHospReason] = useState('');
  const [admitting, setAdmitting] = useState(false);
  const [linkedHospitalization, setLinkedHospitalization] = useState(null);
  const [checkingHospitalization, setCheckingHospitalization] = useState(true);
  const [hospitalizationError, setHospitalizationError] = useState(null);

  async function loadLinkedHospitalization() {
    try {
      const response = await fetch(`/api/hospitalizations?originating_visit_id=${id}`);
      const rows = await response.json();
      if (!response.ok || !Array.isArray(rows)) throw new Error('Could not check hospitalization. Please retry.');
      setLinkedHospitalization(rows.find((row) => row.status === 'admitted') || rows[0] || null);
      setHospitalizationError(null);
    } catch (error) {
      setHospitalizationError(error.message);
    } finally {
      setCheckingHospitalization(false);
    }
  }

  const [invoiceInfo, setInvoiceInfo] = useState(null); // { id, status } of the active invoice, if any
  const [creatingInvoice, setCreatingInvoice] = useState(false);


  // Everything below groups into one of these four workflow stages instead
  // of the old side-by-side column pairing — each tab stays mounted (just
  // hidden) when inactive, so nothing loses in-progress state (a running
  // recording, an unsaved draft) when the vet switches tabs.
  const [activeTab, setActiveTab] = useState('exam');

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
          test_results: data.test_results ?? '',
          treatment_notes: data.treatment_notes ?? '',
        });
        setLoading(false);
      });

  async function loadReportList(path, setter) {
    try {
      const res = await fetch(`/api/${path}?visit_id=${id}`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error();
      setter(data);
      setReportsError((prev) => ({ ...prev, [path]: null }));
    } catch {
      setReportsError((prev) => ({ ...prev, [path]: `Could not refresh ${path.replaceAll('-', ' ')}. Reload to try again.` }));
    }
  }
  const loadDiagnostics = () => loadReportList('diagnostics', setDiagnostics);

  const loadTreatmentItems = () =>
    fetch(`/api/treatment-items?visit_id=${id}`)
      .then((res) => res.json())
      .then((data) => setTreatmentItems(Array.isArray(data) ? data : []));

  const loadSurgicalReports = () => loadReportList('surgical-reports', setSurgicalReports);

  const loadDentalReports = () => loadReportList('dental-reports', setDentalReports);

  const loadUltrasoundReports = () => loadReportList('ultrasound-reports', setUltrasoundReports);

  const loadXrayReports = () => loadReportList('xray-reports', setXrayReports);

  const loadInvoiceInfo = () =>
    fetch(`/api/invoices?visit_id=${id}`)
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setInvoiceInfo(list.find((inv) => inv.status !== 'void') || null);
      });

  useEffect(() => {
    loadConsult();
    loadDiagnostics();
    loadTreatmentItems();
    loadSurgicalReports();
    loadDentalReports();
    loadUltrasoundReports();
    loadXrayReports();
    loadInvoiceInfo();
    loadLinkedHospitalization();

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitalizations', filter: `originating_visit_id=eq.${id}` }, loadLinkedHospitalization)
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ultrasound_reports', filter: `visit_id=eq.${id}` }, loadUltrasoundReports)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'xray_reports', filter: `visit_id=eq.${id}` }, loadXrayReports)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices', filter: `visit_id=eq.${id}` }, loadInvoiceInfo)
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function appendRecordField(field, text) {
    setRecord((prev) => ({ ...prev, [field]: prev[field] ? `${prev[field]}\n${text}` : text }));
  }

  // Dictated straight into the treatment item's own Instructions field —
  // this is the same text that gets copied onto the invoice line item (see
  // /api/visits/[id]/invoice) and from there onto the printed dispensing
  // label, so getting it right here means nobody has to re-enter it later.
  function appendTreatInstructions(text) {
    setTreatForm((prev) => ({ ...prev, instructions: prev.instructions ? `${prev.instructions}\n${text}` : text }));
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
      test_results: record.test_results,
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

  // Reassigning the doctor mid-consult (or after) — a handoff between vets,
  // or fixing who actually saw the patient. Works regardless of status.
  async function changeVet(vetId) {
    setVetChangeError(null);
    const res = await fetch(`/api/visits/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attending_vet_id: vetId || null }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setVetChangeError(data.error || 'Failed to change the vet');
      return;
    }
    loadConsult();
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

  async function saveDiagnosticResult(diagId) {
    setSavingResultId(diagId);
    setResultError(null);
    try {
      const result = resultDrafts[diagId] ?? diagnostics.find((d) => d.id === diagId)?.result ?? '';
      const res = await fetch(`/api/diagnostics/${diagId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ result }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save result');
      setResultDrafts((prev) => { const next = { ...prev }; delete next[diagId]; return next; });
      await loadDiagnostics();
    } catch (err) {
      setResultError({ id: diagId, message: err.message });
    } finally {
      setSavingResultId(null);
    }
  }

  // Read lab documents only. Keep originals attached for review in Reports.
  async function handleDiagnosticPhotoUploaded(diagId, testName, file, attachment) {
    setDiagPhotoVersion((prev) => ({ ...prev, [diagId]: (prev[diagId] || 0) + 1 }));
    if (isUltrasoundTest(testName) || isXrayTest(testName)) return;
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') return;
    setExtractingResultId(diagId);
    setExtractResultError((prev) => ({ ...prev, [diagId]: null }));
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('test_name', testName || '');
      const res = await fetch(`/api/diagnostics/${diagId}/extract-result`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setExtractResultError((prev) => ({ ...prev, [diagId]: data.error || 'Failed to read result from photo' }));
        return;
      }
      setResultDrafts((prev) => ({ ...prev, [diagId]: data.result }));
      loadDiagnostics();
    } catch (err) {
      setExtractResultError((prev) => ({ ...prev, [diagId]: err.message || 'Could not read the test result.' }));
    } finally {
      setExtractingResultId(null);
    }
  }

  async function deleteDiagnostic(diagId) {
    await fetch(`/api/diagnostics/${diagId}`, { method: 'DELETE' });
    loadDiagnostics();
    loadTreatmentItems();
  }

  async function postTreatmentItem() {
    const res = await fetch('/api/treatment-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: id, ...treatForm }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to add treatment item');
    }
  }

  async function addTreatmentItem(e) {
    e.preventDefault();
    if (!treatForm.goods_service_id) return;

    const selected = catalog.find((c) => c.id === treatForm.goods_service_id);
    if (selected?.administration_method === 'injectable' && !treatForm.administration_method) return;
    if (isMicrochipProduct(selected?.name)) {
      setMicrochipModalOpen(true);
      return;
    }

    await postTreatmentItem();
    setTreatForm({ goods_service_id: '', instructions: '', quantity: '1', administration_method: '' });
    loadTreatmentItems();
  }

  // Called once the microchip popup is confirmed: adds the treatment item
  // (which becomes an invoice line once this consult is invoiced) as
  // usual, then saves the chip number + implantation date straight to the
  // patient file. Returns an error message on failure, or null on success.
  async function confirmMicrochip(number, date) {
    try {
      await postTreatmentItem();
    } catch (err) {
      return err.message;
    }

    if (consult.patients?.id) {
      const res = await fetch(`/api/patients/${consult.patients.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ microchip_number: number, microchip_implanted_at: date }),
      });
      const data = await res.json();
      if (!res.ok) {
        loadTreatmentItems();
        return `Treatment item added, but couldn't save to the patient file: ${data.error || 'unknown error'}`;
      }
    }

    setTreatForm({ goods_service_id: '', instructions: '', quantity: '1' });
    setMicrochipModalOpen(false);
    loadTreatmentItems();
    return null;
  }

  async function deleteTreatmentItem(itemId) {
    await fetch(`/api/treatment-items/${itemId}`, { method: 'DELETE' });
    loadTreatmentItems();
  }

  // Same pattern as the dental/surgical "Dictate" button, but scoped to
  // one specific Ultrasound diagnostic entry (diagnosticId) rather than a
  // standalone section — a consult can have more than one scan.
  async function startDictateUltrasoundReport(diagnosticId) {
    setDictatingUltrasoundFor(diagnosticId);
    const res = await fetch('/api/ultrasound-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: id, diagnostic_id: diagnosticId }),
    });
    const data = await res.json();
    setDictatingUltrasoundFor(null);
    if (res.ok) {
      setAutoRecordUltrasoundId(data.id);
      loadUltrasoundReports();
    }
  }

  // Same pattern, for an X-ray diagnostic entry.
  async function startDictateXrayReport(diagnosticId) {
    setDictatingXrayFor(diagnosticId);
    const res = await fetch('/api/xray-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: id, diagnostic_id: diagnosticId }),
    });
    const data = await res.json();
    setDictatingXrayFor(null);
    if (res.ok) {
      setAutoRecordXrayId(data.id);
      loadXrayReports();
    }
  }

  // Alternative to "Dictate Report" for ultrasound/x-ray — types findings
  // straight in instead, same shape as the dental/surgical "Or add
  // manually" forms below.
  async function addUltrasoundReport(e, diagnosticId) {
    e.preventDefault();
    const form = ultrasoundForm[diagnosticId] || { performed_by: '', findings: '', notes: '' };
    await fetch('/api/ultrasound-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: id, diagnostic_id: diagnosticId, ...form }),
    });
    setUltrasoundForm((prev) => ({ ...prev, [diagnosticId]: { performed_by: '', findings: '', notes: '' } }));
    loadUltrasoundReports();
  }

  async function addXrayReport(e, diagnosticId) {
    e.preventDefault();
    const form = xrayForm[diagnosticId] || { performed_by: '', findings: '', notes: '' };
    await fetch('/api/xray-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: id, diagnostic_id: diagnosticId, ...form }),
    });
    setXrayForm((prev) => ({ ...prev, [diagnosticId]: { performed_by: '', findings: '', notes: '' } }));
    loadXrayReports();
  }

  // Runs the same AI report generation a dictation triggers (see
  // lib/manualReportGeneration.js), but from whatever's already typed into
  // the report's own findings/notes fields — for a report added by hand.
  // Confirms before overwriting an already-generated (or hand-edited)
  // report, same as any other consequential overwrite in this app.
  async function generateAiReport(apiBase, reportId, hasExisting, onDone) {
    if (hasExisting && !confirm('Regenerate this report? This will replace the current saved report text.')) return;
    setGenerateReportError(null);
    setGenerateReportErrorId(null);
    setGeneratingReportId(reportId);
    try {
      const res = await fetch(`${apiBase}/${reportId}/generate-report`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to generate report');
      await onDone();
    } catch (error) {
      setGenerateReportError(error.message || 'Failed to generate report');
      setGenerateReportErrorId(reportId);
    } finally {
      setGeneratingReportId(null);
    }
  }

  async function deleteConsultReport() {
    await fetch(`/api/visits/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai_summary: null }),
    });
    await loadConsult();
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

  async function admitToHospital(e, kind = 'admission') {
    e.preventDefault();
    if (linkedHospitalization) {
      router.push(`/hospitalization/${linkedHospitalization.id}`);
      return;
    }
    setAdmitting(true);
    try {
      const res = await fetch('/api/hospitalizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originating_visit_id: id, reason: hospReason, kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not admit the patient.');
      setLinkedHospitalization(data);
      router.push(`/hospitalization/${data.id}`);
    } catch (error) {
      setHospitalizationError(error.message);
    } finally {
      setAdmitting(false);
    }
  }

  // The Hospitalization button, clicked while the linked case is still a
  // day procedure — promotes it to a full admission in place (same
  // transition as "Move to Hospital" on the hospitalization page itself)
  // instead of creating a second hospitalization row for this consult.
  async function moveLinkedToHospital() {
    if (!linkedHospitalization) return;
    setAdmitting(true);
    setHospitalizationError(null);
    try {
      const res = await fetch(`/api/hospitalizations/${linkedHospitalization.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'admission' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not move to hospital.');
      setLinkedHospitalization(data);
      router.push(`/hospitalization/${data.id}`);
    } catch (error) {
      setHospitalizationError(error.message);
    } finally {
      setAdmitting(false);
    }
  }

  const vac = useVaccinations(consult?.patients?.id, consult?.patients?.species);
  const patientAlerts = usePatientAlerts(consult?.patients?.id);

  if (loading || !consult || !record) return <p>Loading consult...</p>;
  if (consult.error) return <p>Consult not found.</p>;

  const vets = staff.filter((s) => s.role === 'vet');
  const selectedTreatItem = catalog.find((c) => c.id === treatForm.goods_service_id);

  return (
    <div>
      <div className="consult-header-row">
        <h1>
          {consult.patients?.name}
          {consult.patients?.patient_number ? ` (Patient #${consult.patients.patient_number})` : ''}{' '}
          <span>
            ({consult.patients?.species}) — {consult.status}
          </span>
        </h1>
        <div className="consult-header-actions">
          <select
            className="consult-vet-select"
            value={consult.attending_vet_id || ''}
            onChange={(e) => changeVet(e.target.value)}
          >
            <option value="">Unassigned</option>
            {staff
              .filter((s) => s.role === 'vet')
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.full_name}
                </option>
              ))}
          </select>
          {(patientAlerts.alerts.length > 0 || consult?.patients?.id) && (
            <details className="patient-alerts-panel" open={patientAlerts.alerts.length > 0}>
              <summary>
                ⚠️ Long-Term Patient Notes {patientAlerts.alerts.length > 0 && `(${patientAlerts.alerts.length})`}
              </summary>
              <PatientAlerts {...patientAlerts} staff={staff} />
            </details>
          )}
          <PatientHistoryPanel patientId={consult.patient_id} clientId={consult.client_id} excludeVisitId={id} />
        </div>
      </div>
      {vetChangeError && <p className="error">{vetChangeError}</p>}
      <p>
        Owner:{' '}
        <a href={`/clients/${consult.clients?.id}`}>
          {consult.clients?.full_name}
          {consult.clients?.client_number ? ` (Client #${consult.clients.client_number})` : ''}
        </a>{' '}
        · Patient: <a href={`/patients/${consult.patients?.id}`}>record</a>{' '}
        · Room: {consult.rooms?.name}
      </p>

      <div className="action-row">
        {consult.status === 'in_progress' && (
          <button type="button" className="button-link" onClick={completeConsult}>
            Complete Consult
          </button>
        )}
        <button type="button" className="button-link" onClick={deleteConsult}>
          Delete Consult
        </button>
        <details className="consult-action-toggle">
          <summary className="button-link">📷 Photos</summary>
          <div className="consult-action-dropdown">
            <AttachmentSection entityType="visit" entityId={id} />
          </div>
        </details>
        <details className="consult-action-toggle">
          <summary className="button-link">🎙️ Record</summary>
          <div className="consult-action-dropdown">
            <AudioRecorder entityType="visit" entityId={id} />
          </div>
        </details>
      </div>

      <div className="consult-tabs-row">
        <div className="consult-tabs">
          {CONSULT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`consult-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab((prev) => (tab.id === 'reports' && prev === 'reports' ? null : tab.id))}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <CrossRecordLinks>
        <button
          type="button"
          className={`button-link${invoiceInfo ? ' button-link-invoice' : ''}`}
          onClick={createInvoice}
          disabled={creatingInvoice}
          title={invoiceInfo ? 'Open the invoice, syncing in anything new from the treatment plan' : 'Create an invoice from the treatment plan'}
        >
          🧾 {creatingInvoice ? 'Saving...' : invoiceInfo ? `Invoiced (${invoiceInfo.status})` : 'Invoice'}
        </button>
        {checkingHospitalization || hospitalizationError ? (
          <button type="button" className="button-link" disabled={checkingHospitalization} onClick={loadLinkedHospitalization}>
            {checkingHospitalization ? 'Checking hospitalization…' : 'Retry hospitalization check'}
          </button>
        ) : (
          <>
            {linkedHospitalization?.kind === 'admission' ? (
              <a className="button-link button-link-hospitalization" href={`/hospitalization/${linkedHospitalization.id}`}>
                🏥 Hospitalized
              </a>
            ) : linkedHospitalization?.kind === 'day_procedure' ? (
              <button type="button" className="button-link" disabled={admitting} onClick={moveLinkedToHospital}>
                {admitting ? 'Moving...' : '🏥 Hospitalization'}
              </button>
            ) : (
              <details className="consult-action-toggle">
                <summary className="button-link">🏥 Hospitalization</summary>
                <form className="consult-action-dropdown" onSubmit={(e) => admitToHospital(e, 'admission')}>
                  <input
                    placeholder="Reason for admission"
                    value={hospReason}
                    onChange={(e) => setHospReason(e.target.value)}
                  />
                  <button type="submit" disabled={admitting}>
                    {admitting ? 'Admitting...' : 'Admit to Hospital'}
                  </button>
                </form>
              </details>
            )}

            {linkedHospitalization?.kind === 'day_procedure' ? (
              <a className="button-link button-link-day-procedure" href={`/hospitalization/${linkedHospitalization.id}`}>
                📋 Day Procedure
              </a>
            ) : linkedHospitalization?.kind === 'admission' ? (
              <a
                className="button-link"
                href={`/hospitalization/${linkedHospitalization.id}`}
                title="Already hospitalized — view it"
              >
                📋 Day Procedure
              </a>
            ) : (
              <details className="consult-action-toggle">
                <summary className="button-link">📋 Day Procedure</summary>
                <form className="consult-action-dropdown" onSubmit={(e) => admitToHospital(e, 'day_procedure')}>
                  <input
                    placeholder="Reason"
                    value={hospReason}
                    onChange={(e) => setHospReason(e.target.value)}
                  />
                  <button type="submit" disabled={admitting}>
                    {admitting ? 'Starting...' : 'Start Day Procedure'}
                  </button>
                </form>
              </details>
            )}
          </>
        )}
        {hospitalizationError && <span className="error" role="alert">{hospitalizationError}</span>}
        </CrossRecordLinks>
      </div>

      {/* Exam, Diagnostics & Treatment — the vet's own record (vitals, exam
          findings, consult dictation), any diagnostics ordered off the back
          of it, and the treatment plan drawn from the catalog, side by side
          instead of split across separate tabs. */}
      <div hidden={activeTab !== 'exam'}>
        <div className="workbench">
        <div>
        <h3>Vitals & Exam</h3>
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
            <span className="field-label-row">
              Tests
              <InfoHint>
                Additional test notes. Individual reports and transcribed lab results are available in Reports.
              </InfoHint>
            </span>
            <textarea
              rows={2}
              value={record.test_results}
              onChange={(e) => setRecord({ ...record, test_results: e.target.value })}
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
            {savingRecord ? 'Saving...' : 'Save'}
          </button>
        </form>

        </div>

        <div>
        <h3>
          Diagnostics{' '}
          <InfoHint>
            Also adds this test to the Treatment Plan, ready to invoice. Upload blood work PDFs,
            x-rays, or ultrasound scans on each entry above once it&apos;s added.
          </InfoHint>
        </h3>
        <button type="button" className="button-link" onClick={() => setActiveTab('reports')}>View reports and test results</button>
        <form className="card" onSubmit={addDiagnostic}>
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
          <button type="submit">Add</button>
        </form>

        {diagnostics.map((d) => {
          const testName = d.goods_service_id
            ? catalog.find((c) => c.id === d.goods_service_id)?.name || 'Test'
            : LEGACY_DIAGNOSTIC_TYPE_LABELS[d.type] || d.type;
          const ultrasoundReport = ultrasoundReports.find((r) => r.diagnostic_id === d.id);
          const xrayReport = xrayReports.find((r) => r.diagnostic_id === d.id);

          return (
            <div key={d.id} className="visit-card">
              <div className="visit-header">
                <strong>{testName}</strong>
                <button type="button" onClick={() => deleteDiagnostic(d.id)}>
                  Remove
                </button>
              </div>
              {d.description && <p>{d.description}</p>}
              <div className="diagnostic-result-row">
                <textarea
                  placeholder="Result (add once it's back, or attach a photo below to have it read automatically)"
                  rows={3}
                  value={resultDrafts[d.id] ?? d.result ?? ''}
                  onChange={(e) => setResultDrafts({ ...resultDrafts, [d.id]: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => saveDiagnosticResult(d.id)}
                  disabled={savingResultId === d.id}
                >
                  {savingResultId === d.id ? 'Saving...' : 'Save Result'}
                </button>
              </div>
              {resultError?.id === d.id && <p className="error">{resultError.message}</p>}
              {extractingResultId === d.id && <p className="visit-meta">🔎 Reading result from photo...</p>}
              {extractResultError[d.id] && <p className="error">{extractResultError[d.id]}</p>}
              <AttachmentSection
                entityType="diagnostic"
                entityId={d.id}
                refreshKey={diagPhotoVersion[d.id]}
                onUploaded={(file, attachment) => handleDiagnosticPhotoUploaded(d.id, testName, file, attachment)}
              />

              {isUltrasoundTest(testName) && (
                <div className="postop-panel">
                  <h4>Ultrasound Report</h4>
                  {!ultrasoundReport ? (
                    <>
                      <button
                        type="button"
                        onClick={() => startDictateUltrasoundReport(d.id)}
                        disabled={dictatingUltrasoundFor === d.id}
                      >
                        🎤 {dictatingUltrasoundFor === d.id ? 'Starting...' : 'Dictate Report'}
                      </button>
                      <details>
                        <summary>Or add manually</summary>
                        <form className="form-grid" onSubmit={(e) => addUltrasoundReport(e, d.id)}>
                          <select
                            value={ultrasoundForm[d.id]?.performed_by || ''}
                            onChange={(e) =>
                              setUltrasoundForm({
                                ...ultrasoundForm,
                                [d.id]: { ...(ultrasoundForm[d.id] || {}), performed_by: e.target.value },
                              })
                            }
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
                            value={ultrasoundForm[d.id]?.findings || ''}
                            onChange={(e) =>
                              setUltrasoundForm({
                                ...ultrasoundForm,
                                [d.id]: { ...(ultrasoundForm[d.id] || {}), findings: e.target.value },
                              })
                            }
                          />
                          <textarea
                            rows={2}
                            placeholder="Notes"
                            value={ultrasoundForm[d.id]?.notes || ''}
                            onChange={(e) =>
                              setUltrasoundForm({
                                ...ultrasoundForm,
                                [d.id]: { ...(ultrasoundForm[d.id] || {}), notes: e.target.value },
                              })
                            }
                          />
                          <button type="submit">Add</button>
                        </form>
                      </details>
                    </>
                  ) : (
                    <>
                      <p className="visit-meta">
                        {ultrasoundReport.staff?.full_name || 'unassigned'} ·{' '}
                        {ultrasoundReport.performed_at
                          ? new Date(ultrasoundReport.performed_at).toLocaleString()
                          : ''}
                      </p>
                      <AudioRecorder
                        entityType="ultrasound_report"
                        entityId={ultrasoundReport.id}
                        autoStart={ultrasoundReport.id === autoRecordUltrasoundId}
                      />
                      <AttachmentSection entityType="ultrasound_report" entityId={ultrasoundReport.id} />
                      <button
                        type="button"
                        onClick={() =>
                          generateAiReport(
                            '/api/ultrasound-reports',
                            ultrasoundReport.id,
                            !!ultrasoundReport.ai_summary,
                            loadUltrasoundReports
                          )
                        }
                        disabled={
                          generatingReportId === ultrasoundReport.id ||
                          !(ultrasoundReport.findings || ultrasoundReport.notes)
                        }
                      >
                        {generatingReportId === ultrasoundReport.id
                          ? 'Generating...'
                          : ultrasoundReport.ai_summary
                            ? '🔄 Regenerate AI Report'
                            : '✨ Generate AI Report'}
                      </button>
                      {generateReportErrorId === ultrasoundReport.id && <p className="error">{generateReportError}</p>}
                      <button type="button" className="button-link" onClick={() => setActiveTab('reports')}>View and share in Reports</button>
                    </>
                  )}
                </div>
              )}

              {isXrayTest(testName) && (
                <div className="postop-panel">
                  <h4>X-ray Report</h4>
                  {!xrayReport ? (
                    <>
                      <button
                        type="button"
                        onClick={() => startDictateXrayReport(d.id)}
                        disabled={dictatingXrayFor === d.id}
                      >
                        🎤 {dictatingXrayFor === d.id ? 'Starting...' : 'Dictate Report'}
                      </button>
                      <details>
                        <summary>Or add manually</summary>
                        <form className="form-grid" onSubmit={(e) => addXrayReport(e, d.id)}>
                          <select
                            value={xrayForm[d.id]?.performed_by || ''}
                            onChange={(e) =>
                              setXrayForm({
                                ...xrayForm,
                                [d.id]: { ...(xrayForm[d.id] || {}), performed_by: e.target.value },
                              })
                            }
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
                            value={xrayForm[d.id]?.findings || ''}
                            onChange={(e) =>
                              setXrayForm({
                                ...xrayForm,
                                [d.id]: { ...(xrayForm[d.id] || {}), findings: e.target.value },
                              })
                            }
                          />
                          <textarea
                            rows={2}
                            placeholder="Notes"
                            value={xrayForm[d.id]?.notes || ''}
                            onChange={(e) =>
                              setXrayForm({
                                ...xrayForm,
                                [d.id]: { ...(xrayForm[d.id] || {}), notes: e.target.value },
                              })
                            }
                          />
                          <button type="submit">Add</button>
                        </form>
                      </details>
                    </>
                  ) : (
                    <>
                      <p className="visit-meta">
                        {xrayReport.staff?.full_name || 'unassigned'} ·{' '}
                        {xrayReport.performed_at ? new Date(xrayReport.performed_at).toLocaleString() : ''}
                      </p>
                      <AudioRecorder
                        entityType="xray_report"
                        entityId={xrayReport.id}
                        autoStart={xrayReport.id === autoRecordXrayId}
                      />
                      <AttachmentSection entityType="xray_report" entityId={xrayReport.id} />
                      <button
                        type="button"
                        onClick={() =>
                          generateAiReport('/api/xray-reports', xrayReport.id, !!xrayReport.ai_summary, loadXrayReports)
                        }
                        disabled={generatingReportId === xrayReport.id || !(xrayReport.findings || xrayReport.notes)}
                      >
                        {generatingReportId === xrayReport.id
                          ? 'Generating...'
                          : xrayReport.ai_summary
                            ? '🔄 Regenerate AI Report'
                            : '✨ Generate AI Report'}
                      </button>
                      {generateReportErrorId === xrayReport.id && <p className="error">{generateReportError}</p>}
                      <button type="button" className="button-link" onClick={() => setActiveTab('reports')}>View and share in Reports</button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        </div>

        <div>
        <h3>Treatment Plan</h3>
        <form className="card" onSubmit={addTreatmentItem}>
          <CatalogPicker
            catalog={catalog}
            subcategories={subcategories}
            value={treatForm.goods_service_id}
            onChange={(value) => setTreatForm({ ...treatForm, goods_service_id: value })}
            onItemCreated={(item) => setCatalog((prev) => [...prev, item])}
            onCategoryChange={setTreatCategory}
          />
          {selectedTreatItem?.administration_method === 'injectable' && (
            <AdministrationRoutePicker
              value={treatForm.administration_method}
              onChange={(value) => setTreatForm({ ...treatForm, administration_method: value })}
            />
          )}
          <div className="instructions-input-row">
            <input
              placeholder="Instructions (dosage, frequency, duration)"
              value={treatForm.instructions}
              onChange={(e) => setTreatForm({ ...treatForm, instructions: e.target.value })}
            />
            <VoiceToTextButton kind="treatment_item_instructions" onResult={appendTreatInstructions} />
          </div>
          <input
            type="number"
            step="0.01"
            placeholder="Quantity"
            value={treatForm.quantity}
            onChange={(e) => setTreatForm({ ...treatForm, quantity: e.target.value })}
          />
          <button
            type="submit"
            disabled={selectedTreatItem?.administration_method === 'injectable' && !treatForm.administration_method}
          >
            + Add
          </button>
        </form>

        {microchipModalOpen && (
          <MicrochipCaptureModal
            patientName={consult.patients?.name}
            patientNumber={consult.patients?.patient_number}
            confirmLabel="Save"
            onCancel={() => setMicrochipModalOpen(false)}
            onConfirm={confirmMicrochip}
          />
        )}

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
        </div>
        </div>

      </div>

      {/* Vaccinations — split out of the old Treatment tab into its own,
          quick-to-open tab: log one and you're done, without the itemized
          treatment plan taking up the rest of the screen. */}
      <div hidden={activeTab !== 'vaccinations'}>
        <h3>
          Vaccinations
          {vac.vaccinations.length === 0 && (
            <span className="heading-hint"> — No vaccinations recorded yet.</span>
          )}
        </h3>
        {vac.vaccinations.length > 0 && (
          <VaccinationHistory vaccinations={vac.vaccinations} onDelete={vac.deleteVaccination} />
        )}
        <VaccinationForm {...vac} species={consult.patients?.species} staff={staff} />
      </div>

      <div hidden={activeTab !== 'reports'}>
        <PatientReportOverview patientId={consult.patient_id} title="Earlier reports for this patient" />
        <RecordReports
          record={consult} recordApiBase="/api/visits" showOverallReport
          diagnostics={diagnostics} catalog={catalog}
          groups={[
            { label: 'Dental report', reports: dentalReports, apiBase: '/api/dental-reports', entityType: 'dental_report', reload: loadDentalReports },
            { label: 'Surgical report', reports: surgicalReports, apiBase: '/api/surgical-reports', entityType: 'surgical_report', reload: loadSurgicalReports },
            { label: 'Ultrasound report', reports: ultrasoundReports, apiBase: '/api/ultrasound-reports', entityType: 'ultrasound_report', sourceTab: 'exam', reload: loadUltrasoundReports },
            { label: 'X-ray report', reports: xrayReports, apiBase: '/api/xray-reports', entityType: 'xray_report', sourceTab: 'exam', reload: loadXrayReports },
          ]}
          onRecordSaved={loadConsult} onOpenSource={setActiveTab}
          onGenerate={generateAiReport} generatingId={generatingReportId}
          generationError={generateReportError} generationErrorId={generateReportErrorId}
          onGenerateOverallReport={() => generateAiReport('/api/visits', id, !!consult.ai_summary, loadConsult)}
          onDeleteOverallReport={deleteConsultReport} onDeleteDiagnostic={deleteDiagnostic}
          resultDrafts={resultDrafts} onResultChange={(diagId, text) => setResultDrafts((prev) => ({ ...prev, [diagId]: text }))}
          onSaveResult={saveDiagnosticResult} savingResultId={savingResultId} resultError={resultError}
          onUploaded={handleDiagnosticPhotoUploaded} extractingResultId={extractingResultId}
          extractResultError={extractResultError} attachmentVersions={diagPhotoVersion}
          reportsError={Object.values(reportsError).filter(Boolean).join(' ')}
        />
      </div>
    </div>
  );
}
