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

const DIAGNOSTIC_TYPES = [
  { value: 'blood_test', label: 'Blood test' },
  { value: 'xray', label: 'X-ray' },
  { value: 'ultrasound', label: 'Ultrasound' },
  { value: 'other', label: 'Other' },
];

function NoteThread({ visitId, staff }) {
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState('');
  const [authorId, setAuthorId] = useState('');

  const load = () =>
    fetch(`/api/consult-notes?visit_id=${visitId}`)
      .then((res) => res.json())
      .then((data) => setNotes(Array.isArray(data) ? data : []));

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`consult-notes-${visitId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'consult_notes', filter: `visit_id=eq.${visitId}` },
        () => load()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId]);

  async function addNote(e) {
    e.preventDefault();
    if (!text.trim()) return;
    await fetch('/api/consult-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: visitId, author_id: authorId || null, note_text: text }),
    });
    setText('');
    load();
  }

  return (
    <div className="notes">
      <ul className="note-list">
        {notes.map((n) => (
          <li key={n.id}>
            <span className="note-author">{n.staff?.full_name || 'Unknown'}:</span> {n.note_text}
          </li>
        ))}
        {notes.length === 0 && <li className="note-empty">No notes yet.</li>}
      </ul>
      <form onSubmit={addNote} className="note-form">
        <select value={authorId} onChange={(e) => setAuthorId(e.target.value)}>
          <option value="">Author...</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
        <input placeholder="Add a note..." value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit">Add</button>
      </form>
    </div>
  );
}

export default function ConsultDetailPage() {
  const { id } = useParams();
  const router = useRouter();

  const [consult, setConsult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [catalog, setCatalog] = useState([]);

  const [record, setRecord] = useState(null);
  const [savingRecord, setSavingRecord] = useState(false);
  const [recordError, setRecordError] = useState(null);

  const [diagnostics, setDiagnostics] = useState([]);
  const [diagForm, setDiagForm] = useState({ type: 'blood_test', description: '', result: '' });

  const [treatmentItems, setTreatmentItems] = useState([]);
  const [treatForm, setTreatForm] = useState({ goods_service_id: '', instructions: '', quantity: '1' });

  const [surgicalReports, setSurgicalReports] = useState([]);
  const [surgForm, setSurgForm] = useState({ surgeon_id: '', procedure_name: '', notes: '' });

  const [dentalReports, setDentalReports] = useState([]);
  const [dentalForm, setDentalForm] = useState({
    performed_by: '',
    findings: '',
    procedures_performed: '',
    notes: '',
  });

  const [hospReason, setHospReason] = useState('');
  const [admitting, setAdmitting] = useState(false);

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

  useEffect(() => {
    loadConsult();
    loadDiagnostics();
    loadTreatmentItems();
    loadSurgicalReports();
    loadDentalReports();

    Promise.all([
      fetch('/api/staff').then((res) => res.json()),
      fetch('/api/rooms').then((res) => res.json()),
      fetch('/api/goods-services?active=true').then((res) => res.json()),
    ]).then(([staffData, roomsData, catalogData]) => {
      setStaff(Array.isArray(staffData) ? staffData : []);
      setRooms(Array.isArray(roomsData) ? roomsData : []);
      setCatalog(Array.isArray(catalogData) ? catalogData : []);
    });

    const channel = supabase
      .channel(`consult-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits', filter: `id=eq.${id}` }, loadConsult)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'diagnostics', filter: `visit_id=eq.${id}` }, loadDiagnostics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'treatment_items', filter: `visit_id=eq.${id}` }, loadTreatmentItems)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'surgical_reports', filter: `visit_id=eq.${id}` }, loadSurgicalReports)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dental_reports', filter: `visit_id=eq.${id}` }, loadDentalReports)
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
    await fetch('/api/diagnostics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: id, ...diagForm }),
    });
    setDiagForm({ type: 'blood_test', description: '', result: '' });
    loadDiagnostics();
  }

  async function deleteDiagnostic(diagId) {
    await fetch(`/api/diagnostics/${diagId}`, { method: 'DELETE' });
    loadDiagnostics();
  }

  async function addTreatmentItem(e) {
    e.preventDefault();
    if (!treatForm.goods_service_id) return;
    await fetch('/api/treatment-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: id, ...treatForm }),
    });
    setTreatForm({ goods_service_id: '', instructions: '', quantity: '1' });
    loadTreatmentItems();
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
          Anamnesis (history / owner-reported complaint)
          <textarea
            rows={2}
            value={record.anamnesis}
            onChange={(e) => setRecord({ ...record, anamnesis: e.target.value })}
          />
        </label>
        <label>
          Findings (physical exam)
          <textarea
            rows={2}
            value={record.findings}
            onChange={(e) => setRecord({ ...record, findings: e.target.value })}
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
          Treatment plan notes
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
      </div>

      <div>
      <h2>Notes</h2>
      <NoteThread visitId={id} staff={staff} />
      <h3>Record Consult</h3>
      <p className="visit-meta">
        Record the consult and Claude will transcribe and summarize it into a note above.
      </p>
      <AudioRecorder entityType="visit" entityId={id} />
      </div>
      </div>

      <div className="two-col">
      <div>
      <h2>Diagnostics</h2>
      {diagnostics.map((d) => (
        <div key={d.id} className="visit-card">
          <div className="visit-header">
            <strong>{DIAGNOSTIC_TYPES.find((t) => t.value === d.type)?.label || d.type}</strong>
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
        <select value={diagForm.type} onChange={(e) => setDiagForm({ ...diagForm, type: e.target.value })}>
          {DIAGNOSTIC_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          placeholder="Description (what was ordered)"
          value={diagForm.description}
          onChange={(e) => setDiagForm({ ...diagForm, description: e.target.value })}
        />
        <input
          placeholder="Result"
          value={diagForm.result}
          onChange={(e) => setDiagForm({ ...diagForm, result: e.target.value })}
        />
        <button type="submit">Add Diagnostic</button>
      </form>
      </div>

      <div>
      <h2>Treatment Plan</h2>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Instructions</th>
            <th>Qty</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {treatmentItems.length === 0 && (
            <tr>
              <td colSpan={4}>No treatment items yet.</td>
            </tr>
          )}
          {treatmentItems.map((t) => (
            <tr key={t.id}>
              <td>
                {t.goods_services?.name} ({t.goods_services?.category})
              </td>
              <td>{t.instructions}</td>
              <td>{t.quantity}</td>
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
        <select
          required
          value={treatForm.goods_service_id}
          onChange={(e) => setTreatForm({ ...treatForm, goods_service_id: e.target.value })}
        >
          <option value="">Select from catalog...</option>
          {catalog.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.category})
            </option>
          ))}
        </select>
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
      </div>
      </div>

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
        <input
          placeholder="Notes"
          value={surgForm.notes}
          onChange={(e) => setSurgForm({ ...surgForm, notes: e.target.value })}
        />
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
        <input
          placeholder="Notes"
          value={dentalForm.notes}
          onChange={(e) => setDentalForm({ ...dentalForm, notes: e.target.value })}
        />
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
