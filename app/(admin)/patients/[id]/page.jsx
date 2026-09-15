// app/patients/[id]/page.jsx
// Patient detail: full record, linking back to the owning client, plus the
// patient's vaccination history and a form to record a new one — the
// vaccination logic itself lives in useVaccinations/VaccinationForm/
// VaccinationHistory (shared with the consult page), laid out here beside
// the patient info instead of the consult page's generic side-by-side.

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useVaccinations } from '@/app/_components/useVaccinations';
import VaccinationForm from '@/app/_components/VaccinationForm';
import VaccinationHistory from '@/app/_components/VaccinationHistory';
import { usePatientAlerts } from '@/app/_components/usePatientAlerts';
import PatientAlerts from '@/app/_components/PatientAlerts';
import DentalChart from '@/app/_components/DentalChart';
import PatientHistoryPanel from '@/app/_components/PatientHistoryPanel';
import CrossRecordLinks from '@/app/_components/CrossRecordLinks';
import WeightHistoryChart from '@/app/_components/WeightHistoryChart';
import SpeciesField from '@/app/_components/SpeciesField';
import PetAttributeField from '@/app/_components/PetAttributeField';
import { CAT_BREEDS, DOG_BREEDS, CAT_COLORS, DOG_COLORS } from '@/lib/petAttributes';

const SEX_LABELS = {
  male: 'Male',
  female: 'Female',
  male_castrated: 'Male (Castrated)',
  female_spayed: 'Female (Spayed)',
  unknown: 'Unknown',
};

export default function PatientDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState([]);
  const [savingDentalChart, setSavingDentalChart] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);
  const [startingDayProcedure, setStartingDayProcedure] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState(null);
  const [statusOverview, setStatusOverview] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [weightHistory, setWeightHistory] = useState([]);

  const load = () =>
    fetch(`/api/patients/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setPatient(data);
        setLoading(false);
      });

  const loadStatusOverview = () =>
    fetch(`/api/patients/${id}/status-overview`)
      .then((res) => res.json())
      .then((data) => setStatusOverview(data));

  const loadQuotes = () =>
    fetch(`/api/patients/${id}/proforma-invoices`)
      .then((res) => res.json())
      .then((data) => setQuotes(Array.isArray(data) ? data : []));

  const loadWeightHistory = () =>
    fetch(`/api/patients/${id}/weight-history`)
      .then((res) => res.json())
      .then((data) => setWeightHistory(Array.isArray(data) ? data : []));

  useEffect(() => {
    load();
    loadStatusOverview();
    loadQuotes();
    loadWeightHistory();
    fetch('/api/staff')
      .then((res) => res.json())
      .then((data) => setStaff(Array.isArray(data) ? data : []));

    const channel = supabase
      .channel(`patient-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'patients', filter: `id=eq.${id}` },
        () => load()
      )
      // Any of these changing for this patient can flip a status pill
      // (a consult finishing, an admission starting, an invoice getting
      // paid) — invoices aren't filterable by patient_id directly, so
      // that one just re-checks on any invoice change rather than trying
      // to filter server-side.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'visits', filter: `patient_id=eq.${id}` },
        () => {
          loadStatusOverview();
          loadWeightHistory();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hospitalizations', filter: `patient_id=eq.${id}` },
        () => loadStatusOverview()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => loadStatusOverview())
      // hospitalization_notes isn't filterable by patient_id directly (only
      // hospitalization_id) — same loose-filter tradeoff as invoices above,
      // re-checking on any change rather than trying to filter server-side.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitalization_notes' }, () =>
        loadWeightHistory()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'proforma_invoices', filter: `patient_id=eq.${id}` },
        () => loadQuotes()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const vac = useVaccinations(id, patient?.species, { clientId: patient?.client_id });
  const patientAlerts = usePatientAlerts(id);

  async function startDayProcedure() {
    setStartingDayProcedure(true);
    try {
      const res = await fetch('/api/hospitalizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: id, client_id: patient.client_id, kind: 'day_procedure' }),
      });
      const data = await res.json();
      if (res.ok) router.push(`/hospitalization/${data.id}`);
    } finally {
      setStartingDayProcedure(false);
    }
  }

  // A standalone invoice, not tied to any consult/hospitalization — for a
  // client who buys something separately (food, a refill) while their pet
  // has its own open case with its own bill (see POST /api/invoices).
  async function createInvoice() {
    setCreatingInvoice(true);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: patient.client_id }),
      });
      const data = await res.json();
      if (res.ok) router.push(`/invoices/${data.id}`);
    } finally {
      setCreatingInvoice(false);
    }
  }

  // A quote for the client, entirely separate from the real invoicing
  // system (see migrations/101_proforma_invoices.sql) — nothing here ever
  // reaches accounting or a Statement of Account.
  async function createProformaInvoice() {
    setCreatingQuote(true);
    setQuoteError(null);
    try {
      const res = await fetch(`/api/patients/${id}/proforma-invoices`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setQuoteError(data.error || `Failed to create the quote (HTTP ${res.status})`);
        return;
      }
      router.push(`/proforma/${data.id}`);
    } catch (err) {
      setQuoteError(err.message || 'Failed to create the quote — check your connection and try again');
    } finally {
      setCreatingQuote(false);
    }
  }

  async function toggleDeceased() {
    const nextDeceased = !patient.deceased;
    if (nextDeceased && !confirm(`Mark ${patient.name} as deceased (RIP)?`)) return;
    const res = await fetch(`/api/patients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deceased: nextDeceased }),
    });
    if (res.ok) {
      setPatient((prev) => ({ ...prev, deceased: nextDeceased }));
    }
  }

  function startEdit() {
    setEditForm({
      name: patient.name || '',
      species: patient.species || '',
      breed: patient.breed || '',
      color: patient.color || '',
      sex: patient.sex || '',
      date_of_birth: patient.date_of_birth || '',
      current_weight_kg: patient.current_weight_kg ?? '',
      microchip_number: patient.microchip_number || '',
      microchip_implanted_at: patient.microchip_implanted_at || '',
      notes: patient.notes || '',
    });
    setEditError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditError(null);
  }

  async function saveEdit(e) {
    e.preventDefault();
    setSavingEdit(true);
    setEditError(null);
    const res = await fetch(`/api/patients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...editForm,
        current_weight_kg: editForm.current_weight_kg === '' ? null : Number(editForm.current_weight_kg),
        date_of_birth: editForm.date_of_birth || null,
        microchip_implanted_at: editForm.microchip_implanted_at || null,
      }),
    });
    const data = await res.json();
    setSavingEdit(false);
    if (!res.ok) {
      setEditError(data.error || 'Failed to save patient');
      return;
    }
    setEditing(false);
    load();
  }

  async function updateDentalChart(newChart) {
    setSavingDentalChart(true);
    const res = await fetch(`/api/patients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dental_chart: newChart }),
    });
    const data = await res.json();
    setSavingDentalChart(false);
    if (res.ok) {
      setPatient((prev) => ({ ...prev, dental_chart: data.dental_chart }));
    }
  }

  if (loading) return <p>Loading patient...</p>;
  if (!patient || patient.error) return <p>Patient not found.</p>;

  return (
    <div>
      <p>
        <a href="/search">&larr; Back to Search</a>
      </p>
      <div className="consult-header-row">
        <h1>
          {patient.name} <span>(Patient #{patient.patient_number})</span>
          {patient.deceased && <span className="error"> · Deceased</span>}
        </h1>
        <details className="patient-alerts-panel" open={patientAlerts.alerts.length > 0}>
          <summary>
            ⚠️ Long-Term Patient Notes {patientAlerts.alerts.length > 0 && `(${patientAlerts.alerts.length})`}
          </summary>
          <PatientAlerts {...patientAlerts} staff={staff} />
        </details>
      </div>

      <div className="action-row">
        <a href={`/appointments?client_id=${patient.client_id}&patient_id=${patient.id}`} className="button-link">
          Book Appointment
        </a>
        <button type="button" className="button-link" onClick={createInvoice} disabled={creatingInvoice}
          title="Start a standalone invoice not tied to any consult or admission — e.g. a separate retail purchase">
          {creatingInvoice ? 'Creating…' : 'Create Invoice'}
        </button>
        <button type="button" className="button-link" onClick={createProformaInvoice} disabled={creatingQuote}
          title="Draft a price quote to send the client — never logged to accounting, no VAT invoice, no accounting effect">
          {creatingQuote ? 'Creating…' : '📝 Create Proforma Invoice'}
        </button>
        <a href={`/patients/${patient.id}/history`} className="button-link">
          📖 Full Patient History
        </a>
        <button type="button" className="button-link" onClick={toggleDeceased}>
          {patient.deceased ? (
            'Undo RIP'
          ) : (
            <>
              Mark as RIP <span style={{ fontSize: '0.8em' }}>🐾</span>
            </>
          )}
        </button>
        {/* Same color-coded pattern as the Consult/Hospitalization/Invoice
            pages' own cross-record links: colored + linked straight to the
            open record when one exists, plain pink "start one" when not —
            an at-a-glance status overview instead of just a list of
            actions. */}
        <CrossRecordLinks>
          {statusOverview?.consult ? (
            <a className="button-link button-link-consult" href={`/consults/${statusOverview.consult.id}`}>
              Consult
            </a>
          ) : (
            <a href={`/consults?client_id=${patient.client_id}&patient_id=${patient.id}`} className="button-link">
              New Consult
            </a>
          )}
          {statusOverview?.hospitalization ? (
            <a
              className="button-link button-link-hospitalization"
              href={`/hospitalization/${statusOverview.hospitalization.id}`}
            >
              Hospitalization
            </a>
          ) : (
            <a href="/hospitalization" className="button-link">
              Admit to Hospital
            </a>
          )}
          {statusOverview?.dayProcedure ? (
            <a
              className="button-link button-link-day-procedure"
              href={`/hospitalization/${statusOverview.dayProcedure.id}`}
            >
              Day Procedure
            </a>
          ) : (
            <button type="button" className="button-link" onClick={startDayProcedure} disabled={startingDayProcedure}>
              {startingDayProcedure ? 'Starting...' : '📋 Day Procedure'}
            </button>
          )}
          {statusOverview?.invoice ? (
            <a className="button-link button-link-invoice" href={`/invoices/${statusOverview.invoice.id}`}>
              Invoice
            </a>
          ) : (
            <a href={`/invoices?client_id=${patient.client_id}`} className="button-link">
              Invoice
            </a>
          )}
        </CrossRecordLinks>
      </div>
      {quoteError && <p className="error">{quoteError}</p>}

      <div className="split">
        <div className="split-main">
          {editing ? (
            <form className="card" onSubmit={saveEdit}>
              {editError && <p className="error">{editError}</p>}
              <label>
                Name
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </label>
              <SpeciesField value={editForm.species} onChange={(species) => setEditForm({ ...editForm, species })} />
              <PetAttributeField
                species={editForm.species}
                value={editForm.breed}
                onChange={(breed) => setEditForm({ ...editForm, breed })}
                catOptions={CAT_BREEDS}
                dogOptions={DOG_BREEDS}
                placeholder="Breed"
              />
              <PetAttributeField
                species={editForm.species}
                value={editForm.color}
                onChange={(color) => setEditForm({ ...editForm, color })}
                catOptions={CAT_COLORS}
                dogOptions={DOG_COLORS}
                placeholder="Color"
              />
              <label>
                Sex
                <select value={editForm.sex} onChange={(e) => setEditForm({ ...editForm, sex: e.target.value })}>
                  <option value="">Select...</option>
                  {Object.entries(SEX_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date of birth
                <input
                  type="date"
                  value={editForm.date_of_birth}
                  onChange={(e) => setEditForm({ ...editForm, date_of_birth: e.target.value })}
                />
              </label>
              <label>
                Weight (kg)
                <input
                  type="number"
                  step="0.01"
                  value={editForm.current_weight_kg}
                  onChange={(e) => setEditForm({ ...editForm, current_weight_kg: e.target.value })}
                />
              </label>
              <label>
                Microchip #
                <input
                  value={editForm.microchip_number}
                  onChange={(e) => setEditForm({ ...editForm, microchip_number: e.target.value })}
                />
              </label>
              <label>
                Microchip implanted
                <input
                  type="date"
                  value={editForm.microchip_implanted_at}
                  onChange={(e) => setEditForm({ ...editForm, microchip_implanted_at: e.target.value })}
                />
              </label>
              <label>
                Notes
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                />
              </label>
              <div className="home-links">
                <button type="submit" disabled={savingEdit}>
                  {savingEdit ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={cancelEdit} disabled={savingEdit}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="patient-facts">
              <div className="patient-fact">
                <span className="patient-fact-label">Owner</span>
                <a href={`/clients/${patient.clients?.id}`}>
                  {patient.clients?.full_name} (Client #{patient.clients?.client_number})
                </a>
              </div>
              <div className="patient-fact">
                <span className="patient-fact-label">Species</span>
                <span>{patient.species}</span>
              </div>
              <div className="patient-fact">
                <span className="patient-fact-label">Breed</span>
                <span>{patient.breed || '—'}</span>
              </div>
              <div className="patient-fact">
                <span className="patient-fact-label">Color</span>
                <span>{patient.color || '—'}</span>
              </div>
              <div className="patient-fact">
                <span className="patient-fact-label">Sex</span>
                <span>{SEX_LABELS[patient.sex] || 'unknown'}</span>
              </div>
              <div className="patient-fact">
                <span className="patient-fact-label">Date of birth</span>
                <span>{patient.date_of_birth || '—'}</span>
              </div>
              <div className="patient-fact">
                <span className="patient-fact-label">Weight (kg)</span>
                <span>{patient.current_weight_kg ?? '—'}</span>
              </div>
              <div className="patient-fact">
                <span className="patient-fact-label">Microchip #</span>
                <span>{patient.microchip_number || '—'}</span>
              </div>
              <div className="patient-fact">
                <span className="patient-fact-label">Microchip implanted</span>
                <span>{patient.microchip_implanted_at || '—'}</span>
              </div>
              <div className="patient-fact">
                <span className="patient-fact-label">Notes</span>
                <span>{patient.notes || '—'}</span>
              </div>
            </div>
          )}
          {!editing && (
            <p>
              <button type="button" onClick={startEdit}>
                Edit
              </button>
            </p>
          )}
          <h2>Weight History</h2>
          <WeightHistoryChart data={weightHistory} />
        </div>

        <div className="split-aside">
          <VaccinationForm {...vac} species={patient.species} staff={staff} />
        </div>
      </div>

      {quotes.length > 0 && (
        <>
          <h2>Quotes</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Items</th>
                <th>Estimated Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const items = q.proforma_invoice_items || [];
                const subtotal = items.reduce((sum, item) => sum + Number(item.line_total), 0);
                const total = Math.round(subtotal * 1.05 * 100) / 100;
                return (
                  <tr key={q.id}>
                    <td>{new Date(q.created_at).toLocaleDateString()}</td>
                    <td>{items.length}</td>
                    <td>AED {total.toFixed(2)}</td>
                    <td>
                      <a href={`/proforma/${q.id}`}>Open</a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      <PatientHistoryPanel
        patientId={patient.id}
        clientId={patient.client_id}
        title="Consults, Hospitalizations & Invoices"
      />

      <h2>Vaccination History</h2>
      <VaccinationHistory vaccinations={vac.vaccinations} onDelete={vac.deleteVaccination} />

      <h2>Dental Chart</h2>
      <DentalChart
        species={patient.species}
        value={patient.dental_chart}
        onChange={updateDentalChart}
        saving={savingDentalChart}
      />
    </div>
  );
}
