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
import { formatShortDate } from '@/lib/formatTimestamp';
import RecordPhotoStrip from './RecordPhotoStrip';
import { testHistoryRows, testKind, TEST_ICONS } from '@/lib/patientTests';
import { reportPdfHref } from '@/lib/clientAppReports';

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
  pill = false,
  tab = false, // a small tab (see .case-tab) opening the list in a dropdown
}) {
  const [events, setEvents] = useState([]);
  // Photos per consult/stay ("visit:<id>" / "hospitalization:<id>"), shown
  // as thumbnails under each one. Only for a single pet's history.
  const [photosByRecord, setPhotosByRecord] = useState({});
  const showPatientName = !patientId;
  // A single pet's History also lists every test it has had (bloods,
  // x-rays, ultrasounds...), newest first, under its own "Tests" switch
  // (Jim, 19 Nov; lib/patientTests.js).
  const [tests, setTests] = useState([]);
  const [view, setView] = useState('visits');

  useEffect(() => {
    if (!patientId) return setTests([]);
    fetch(`/api/patients/${patientId}/report-overview`)
      .then((res) => res.json())
      .then((rows) => setTests(testHistoryRows(Array.isArray(rows) ? rows : [])))
      .catch(() => setTests([]));
  }, [patientId]);

  useEffect(() => {
    if (!patientId && !clientId) return;

    const visitsQuery = patientId ? `patient_id=${patientId}` : `client_id=${clientId}`;
    const hospQuery = patientId ? `patient_id=${patientId}` : `client_id=${clientId}`;

    if (patientId) {
      fetch(`/api/patients/${patientId}/photos`)
        .then((res) => res.json())
        .then((data) => {
          const grouped = {};
          for (const p of Array.isArray(data) ? data : []) (grouped[`${p.record_type}:${p.record_id}`] ||= []).push(p);
          setPhotosByRecord(grouped);
        })
        .catch(() => setPhotosByRecord({}));
    }

    Promise.all([
      fetch(`/api/visits?${visitsQuery}&status=complete`).then((res) => res.json()),
      showHospitalizations
        ? fetch(`/api/hospitalizations?${hospQuery}`).then((res) => res.json())
        : Promise.resolve([]),
    ]).then(async ([visitsData, hospData]) => {
      const rawVisits = (Array.isArray(visitsData) ? visitsData : []).filter((v) => v.id !== excludeVisitId);
      const rawAdmissions = (Array.isArray(hospData) ? hospData : []).filter(
        (h) => h.id !== excludeHospitalizationId
      );

      // patients.client_id can be stale or unset on some older/migrated
      // records, even when that patient's own visits/hospitalizations
      // (looked up above by patient_id, so unaffected by that) carry the
      // correct client_id — the one their invoices were actually created
      // with (see POST /api/visits/:id/invoice and .../hospitalizations/
      // :id/invoice). Scoped to one patient, prefer that authoritative
      // value over the passed clientId prop so invoices aren't silently
      // missed for a patient whose own client_id field is out of date.
      const effectiveClientId = patientId
        ? rawVisits[0]?.client_id || rawAdmissions[0]?.client_id || clientId
        : clientId;

      const invoicesData = effectiveClientId
        ? await fetch(`/api/invoices?client_id=${effectiveClientId}`).then((res) => res.json())
        : [];

      const visits = rawVisits.map((v) => ({ type: 'consult', date: v.started_at, data: v }));
      const admissions = rawAdmissions.map((h) => ({ type: 'hospitalization', date: h.admitted_at, data: h }));
      const invoices = (Array.isArray(invoicesData) ? invoicesData : [])
        .filter((inv) => !patientId || inv.visits?.patient_id === patientId || inv.hospitalizations?.patient_id === patientId)
        .map((inv) => ({ type: 'invoice', date: inv.created_at, data: inv }));
      setEvents([...visits, ...admissions, ...invoices].sort((a, b) => new Date(b.date) - new Date(a.date)));
    });
  }, [patientId, clientId, excludeVisitId, excludeHospitalizationId, showHospitalizations]);

  if (events.length === 0 && tests.length === 0) return null;

  function patientNameFor(item) {
    const patient =
      item.type === 'consult' || item.type === 'hospitalization'
        ? item.data.patients
        : item.data.visits?.patients || item.data.hospitalizations?.patients;
    if (!patient?.name) return null;
    return `${patient.name}${patient.patient_number ? ` (Patient #${patient.patient_number})` : ''}`;
  }

  const testList = (
    <ul className="consult-history-list">
      {tests.map((t) => {
        const pdf = reportPdfHref(t);
        const text = (t.ai_summary || t.result || t.findings || '').trim();
        const here = (excludeVisitId && t.visit_id === excludeVisitId) || (excludeHospitalizationId && t.hospitalization_id === excludeHospitalizationId);
        return (
          <li key={`t-${t.reportType}-${t.recordId}`} className="consult-history-item">
            <p className="visit-meta">
              {TEST_ICONS[testKind(t)]} <strong>{t.kind}</strong>
              {' · '}
              {t.date ? formatShortDate(t.date) : 'Date not recorded'}
              {here ? ' · this case' : <> · <a href={t.href}>{t.source === 'consult' ? 'Consult' : 'Stay'}</a></>}
              {pdf && <> · <a href={pdf} target="_blank" rel="noreferrer">📄 PDF</a></>}
            </p>
            {text ? <p>{truncate(text)}</p> : <p className="note-empty">{t.lab_report_files?.length ? 'Lab report attached (PDF).' : 'No result recorded.'}</p>}
          </li>
        );
      })}
    </ul>
  );

  const switcher = patientId && tests.length > 0 && (
    <div className="history-view-switch" role="group" aria-label="History view">
      <button type="button" className={view === 'visits' ? 'active' : ''} onClick={() => setView('visits')}>
        Visits & invoices <b>{events.length}</b>
      </button>
      <button type="button" className={view === 'tests' ? 'active' : ''} onClick={() => setView('tests')}>
        🧪 Tests <b>{tests.length}</b>
      </button>
    </div>
  );

  const visitList = (
    <ul className="consult-history-list">
      {events.map((e) => {
          const petTag = showPatientName && patientNameFor(e) ? `${patientNameFor(e)} · ` : '';
          if (e.type === 'consult') {
            return (
              <li key={`v-${e.data.id}`} className="consult-history-item">
                <p className="visit-meta">
                  🩺 {petTag}
                  <a href={`/consults/${e.data.id}`}>{formatShortDate(e.data.started_at)}</a>
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
                <RecordPhotoStrip photos={photosByRecord[`visit:${e.data.id}`]} />
              </li>
            );
          }
          if (e.type === 'hospitalization') {
            return (
              <li key={`h-${e.data.id}`} className="consult-history-item">
                <p className="visit-meta">
                  🏥 {petTag}
                  <a href={`/hospitalization/${e.data.id}`}>{formatShortDate(e.data.admitted_at)}</a>
                  {' · '}
                  {e.data.status === 'admitted'
                    ? 'Currently admitted'
                    : `Discharged ${e.data.discharged_at ? formatShortDate(e.data.discharged_at) : ''}`}
                </p>
                {e.data.reason && (
                  <p>
                    <strong>Reason:</strong> {truncate(e.data.reason)}
                  </p>
                )}
                <RecordPhotoStrip photos={photosByRecord[`hospitalization:${e.data.id}`]} />
              </li>
            );
          }
          return (
            <li key={`i-${e.data.id}`} className="consult-history-item">
              <p className="visit-meta">
                🧾 {petTag}
                <a href={`/invoices/${e.data.id}`}>{invoiceLabel(e.data)}</a>
                {' · '}
                {formatShortDate(e.data.created_at)}
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
  );

  const list = (
    <>
      {switcher}
      {view === 'tests' && tests.length > 0 ? testList : events.length ? visitList : <p className="note-empty">No earlier visits.</p>}
    </>
  );

  if (tab) {
    return (
      <details className="case-tab-menu" name="case-tabs">
        <summary className="case-tab">
          🕓 History <b>{events.length}</b>
        </summary>
        <div className="case-tab-dropdown case-tab-dropdown-wide">{list}</div>
      </details>
    );
  }

  if (pill) {
    return (
      <details className="consult-action-toggle">
        <summary className="button-link">
          🕓 {title} ({events.length})
        </summary>
        <div className="consult-action-dropdown">{list}</div>
      </details>
    );
  }

  return (
    <details className="consult-history-panel">
      <summary>
        🕓 {title} ({events.length})
      </summary>
      {list}
    </details>
  );
}
