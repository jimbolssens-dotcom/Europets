// app/_components/PatientHistoryPanel.jsx
// A patient's (or a whole client's) past consults, hospitalizations, and
// invoices, merged into one chronological list — used on the consult page,
// the hospitalization page, the patient page, and the client page, so
// staff can pull up a pet's (or an owner's) full record from wherever
// they're already looking. Collapsed by default so it doesn't compete with
// whatever's currently open.
//
// Pass `patientId` (+ `clientId`, needed to also pull that patient's
// invoices — invoices are only ever queried by client_id, then matched
// back to this one patient via their linked visit/hospitalization) to
// scope to one pet. Pass `clientId` alone to show that owner's full
// history across every pet they have — each item is then labeled with
// which pet it belongs to. `excludeVisitId`/`excludeHospitalizationId`
// drop the record already on screen out of its own history list.

'use client';

import { useEffect, useState } from 'react';
import { money, balanceDue, invoiceLabel } from '@/lib/paymentReminders';

function truncate(str, max = 160) {
  const s = (str || '').trim();
  return s.length > max ? `${s.slice(0, max).trim()}…` : s;
}

export default function PatientHistoryPanel({
  patientId,
  clientId,
  excludeVisitId,
  excludeHospitalizationId,
  showHospitalizations = true,
  title = 'Patient History',
}) {
  const [events, setEvents] = useState([]);
  const showPatientName = !patientId;

  useEffect(() => {
    if (!patientId && !clientId) return;

    const visitsQuery = patientId ? `patient_id=${patientId}` : `client_id=${clientId}`;
    const hospQuery = patientId ? `patient_id=${patientId}` : `client_id=${clientId}`;

    Promise.all([
      fetch(`/api/visits?${visitsQuery}&status=complete`).then((res) => res.json()),
      showHospitalizations
        ? fetch(`/api/hospitalizations?${hospQuery}`).then((res) => res.json())
        : Promise.resolve([]),
      clientId ? fetch(`/api/invoices?client_id=${clientId}`).then((res) => res.json()) : Promise.resolve([]),
    ]).then(([visitsData, hospData, invoicesData]) => {
      const visits = (Array.isArray(visitsData) ? visitsData : [])
        .filter((v) => v.id !== excludeVisitId)
        .map((v) => ({ type: 'consult', date: v.started_at, data: v }));
      const admissions = (Array.isArray(hospData) ? hospData : [])
        .filter((h) => h.id !== excludeHospitalizationId)
        .map((h) => ({ type: 'hospitalization', date: h.admitted_at, data: h }));
      const invoices = (Array.isArray(invoicesData) ? invoicesData : [])
        .filter((inv) => !patientId || inv.visits?.patient_id === patientId || inv.hospitalizations?.patient_id === patientId)
        .map((inv) => ({ type: 'invoice', date: inv.created_at, data: inv }));
      setEvents([...visits, ...admissions, ...invoices].sort((a, b) => new Date(b.date) - new Date(a.date)));
    });
  }, [patientId, clientId, excludeVisitId, excludeHospitalizationId, showHospitalizations]);

  if (events.length === 0) return null;

  function patientNameFor(item) {
    if (item.type === 'consult' || item.type === 'hospitalization') return item.data.patients?.name;
    return item.data.visits?.patients?.name || item.data.hospitalizations?.patients?.name;
  }

  return (
    <details className="consult-history-panel">
      <summary>
        🕓 {title} ({events.length})
      </summary>
      <ul className="consult-history-list">
        {events.map((e) => {
          const petTag = showPatientName && patientNameFor(e) ? `${patientNameFor(e)} · ` : '';
          if (e.type === 'consult') {
            return (
              <li key={`v-${e.data.id}`} className="consult-history-item">
                <p className="visit-meta">
                  🩺 {petTag}
                  <a href={`/consults/${e.data.id}`}>{new Date(e.data.started_at).toLocaleDateString()}</a>
                  {e.data.staff?.full_name && ` · ${e.data.staff.full_name}`}
                </p>
                {e.data.anamnesis && (
                  <p>
                    <strong>Anamnesis:</strong> {truncate(e.data.anamnesis)}
                  </p>
                )}
                {e.data.findings && (
                  <p>
                    <strong>Findings:</strong> {truncate(e.data.findings)}
                  </p>
                )}
                {e.data.treatment_notes && (
                  <p>
                    <strong>Treatment:</strong> {truncate(e.data.treatment_notes)}
                  </p>
                )}
                {!e.data.anamnesis && !e.data.findings && !e.data.treatment_notes && (
                  <p className="note-empty">No record notes for this consult.</p>
                )}
              </li>
            );
          }
          if (e.type === 'hospitalization') {
            return (
              <li key={`h-${e.data.id}`} className="consult-history-item">
                <p className="visit-meta">
                  🏥 {petTag}
                  <a href={`/hospitalization/${e.data.id}`}>{new Date(e.data.admitted_at).toLocaleDateString()}</a>
                  {' · '}
                  {e.data.status === 'admitted'
                    ? 'Currently admitted'
                    : `Discharged ${e.data.discharged_at ? new Date(e.data.discharged_at).toLocaleDateString() : ''}`}
                </p>
                {e.data.reason && (
                  <p>
                    <strong>Reason:</strong> {truncate(e.data.reason)}
                  </p>
                )}
              </li>
            );
          }
          return (
            <li key={`i-${e.data.id}`} className="consult-history-item">
              <p className="visit-meta">
                🧾 {petTag}
                <a href={`/invoices/${e.data.id}`}>{invoiceLabel(e.data)}</a>
                {' · '}
                {new Date(e.data.created_at).toLocaleDateString()}
                {' · '}
                {e.data.status === 'partially_paid' ? 'partially paid' : e.data.status}
                {' · '}
                AED {money(e.data.total)}
                {balanceDue(e.data) > 0 && ` (AED ${money(balanceDue(e.data))} due)`}
              </p>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
