// app/client-app/pets/[id]/page.js
// A single pet's full history for the logged-in client — every consult/
// hospitalization summary, procedure report, and test on file, newest
// first, full text (not just a link out) — the client-facing equivalent
// of the staff-only app/(admin)/patients/[id]/history page, built from
// the same GET /api/patients/:id/report-overview aggregator. Read-only:
// editing/deleting a report is a staff action, not exposed here.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useClientAppSession } from '@/app/_components/useClientAppSession';
import HexIcon from '@/app/_components/HexIcon';
import { formatDateTime } from '@/lib/formatTimestamp';
import { reportPdfHref, reportText, reportKindIcon } from '@/lib/clientAppReports';
import { dueStatus, formatDate } from '@/lib/vaccinationDueStatus';
import { uploadPatientProfilePhoto } from '@/lib/attachments';

// Overdue/due-soon/due-later maps onto the same three-color pill the
// Invoices tab already uses for unpaid/partially-paid/paid — reused here
// rather than inventing a fourth color.
function vaccineStatusPillClass(dateStr) {
  const status = dueStatus(dateStr);
  if (!status) return null;
  if (status.className === 'error') return 'client-app-status-unpaid'; // overdue
  if (status.className === '') return 'client-app-status-partially_paid'; // due within 30 days
  return null; // due later — no pill, just the plain date
}

function ageFromDob(dob) {
  if (!dob) return null;
  const years = (Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 1) return `${Math.round(years * 12)} mo`;
  return `${Math.floor(years)} yr`;
}

export default function ClientAppPetHistoryPage() {
  const { id } = useParams();
  const { clientId, ready } = useClientAppSession();
  const router = useRouter();
  const [pet, setPet] = useState(null);
  const [rows, setRows] = useState([]);
  const [vaccinationsDue, setVaccinationsDue] = useState([]);
  const [admission, setAdmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState(null);
  const [showPhotoChoice, setShowPhotoChoice] = useState(false);
  const cameraInputRef = useRef(null);
  const libraryInputRef = useRef(null);

  useEffect(() => {
    if (ready && !clientId) router.replace('/client-app');
  }, [ready, clientId, router]);

  useEffect(() => {
    if (!ready || !clientId) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/patients/${id}`).then((res) => (res.ok ? res.json() : null)),
      fetch(`/api/patients/${id}/report-overview`).then((res) => (res.ok ? res.json() : [])),
      fetch(`/api/hospitalizations?patient_id=${id}&status=admitted`).then((res) => (res.ok ? res.json() : [])),
      fetch(`/api/vaccinations?patient_id=${id}&due=true&within_days=180`).then((res) => (res.ok ? res.json() : [])),
    ]).then(([petData, rowsData, admissions, dueVaccinations]) => {
      if (cancelled) return;
      // Not this client's pet — don't leak another client's history via a
      // guessed/typed-in patient id.
      if (!petData || petData.error || petData.client_id !== clientId) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setPet(petData);
      setRows(Array.isArray(rowsData) ? rowsData : []);
      setAdmission(Array.isArray(admissions) && admissions.length > 0 ? admissions[0] : null);
      setVaccinationsDue(
        (Array.isArray(dueVaccinations) ? dueVaccinations : []).sort(
          (a, b) => new Date(a.next_due_date) - new Date(b.next_due_date)
        )
      );
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, clientId, id]);

  // Owner-set profile picture (patients.profile_photo_url, migration 129)
  // — shown throughout the app wherever this pet appears (this page, the
  // My Pets list) and, once the same field is wired in elsewhere, on the
  // admin side and eventually reports/messages too. Uploading straight
  // away on file-select rather than a separate "save" step — there's
  // nothing else on this screen to batch it with.
  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError(null);
    setUploadingPhoto(true);
    try {
      const updated = await uploadPatientProfilePhoto(id, file);
      setPet((prev) => ({ ...prev, profile_photo_url: updated.profile_photo_url }));
    } catch (err) {
      setPhotoError(err.message);
    } finally {
      setUploadingPhoto(false);
    }
  }

  // Reuses the clinic's existing client-booking system (the same
  // intake_requests + /portal/intake/:id flow "Send Booking Link" starts
  // from the Clients page) rather than rebuilding the slot-picker/roster/
  // duration rules a second time — this just opens a fresh link already
  // scoped to this client, with this pet pre-selected (see the ?pet=
  // handling added to that page). Navigates the current tab rather than
  // pre-opening a blank one to fill in later — that pattern is unreliable
  // on mobile browsers (popup blockers can silently drop it, or focus can
  // shift to the blank tab before an error has a chance to render
  // anywhere visible).
  async function startBooking() {
    setBookingError(null);
    setBookingLoading(true);
    try {
      const res = await fetch('/api/intake-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not start booking — please try again.');
      window.location.href = `/portal/intake/${data.id}?pet=${id}&app=1`;
    } catch (err) {
      setBookingError(err.message);
      setBookingLoading(false);
    }
  }

  if (!ready || loading) return null;

  if (notFound) {
    return (
      <div className="mobile-page">
        <p className="mobile-subtitle">Pet not found.</p>
        <Link href="/client-app/pets" className="mobile-link-btn">
          Back to My Pets
        </Link>
      </div>
    );
  }

  const age = ageFromDob(pet.date_of_birth);

  return (
    <div className="mobile-page">
      <Link href="/client-app/pets" className="mobile-link-btn">
        ← My Pets
      </Link>

      <div className="client-app-pet-header">
        <div className="client-app-pet-avatar-wrap">
          <button
            type="button"
            className="client-app-pet-avatar-btn"
            onClick={() => setShowPhotoChoice((v) => !v)}
            disabled={uploadingPhoto}
            title={pet.profile_photo_url ? 'Change photo' : 'Add a photo'}
          >
            {pet.profile_photo_url ? (
              <img src={pet.profile_photo_url} alt="" className="client-app-pet-avatar" />
            ) : (
              <span className="client-app-pet-avatar client-app-pet-avatar-placeholder">🐾</span>
            )}
            <span className="client-app-pet-avatar-edit">{uploadingPhoto ? '…' : '✏️'}</span>
          </button>
          {showPhotoChoice && (
            <>
              <div className="client-app-pet-avatar-choice-backdrop" onClick={() => setShowPhotoChoice(false)} />
              <div className="client-app-pet-avatar-choice">
                <button
                  type="button"
                  onClick={() => {
                    setShowPhotoChoice(false);
                    cameraInputRef.current?.click();
                  }}
                >
                  📷 Take Photo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPhotoChoice(false);
                    libraryInputRef.current?.click();
                  }}
                >
                  🖼️ Choose from Library
                </button>
              </div>
            </>
          )}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoChange}
            className="client-app-pet-avatar-input"
          />
          <input
            ref={libraryInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            className="client-app-pet-avatar-input"
          />
        </div>
        <div>
          <h1>{pet.name}</h1>
          <p className="mobile-subtitle">
            {[pet.species, pet.breed, age].filter(Boolean).join(' · ')}
            {pet.current_weight_kg ? ` · ${pet.current_weight_kg} kg` : ''}
          </p>
        </div>
      </div>
      {photoError && <p className="client-app-login-error">{photoError}</p>}

      <button type="button" onClick={startBooking} disabled={bookingLoading}>
        {bookingLoading ? 'Opening booking form...' : `📅 Book an Appointment for ${pet.name}`}
      </button>
      {bookingError && <p className="client-app-login-error">{bookingError}</p>}

      {admission && (
        <div className="client-app-admission-alert">
          <a href={`/portal/hospitalization/${admission.id}?app=1`} className="client-app-admission-alert-link">
            <HexIcon>🏥</HexIcon>
            <span>Currently at the clinic — tap for updates</span>
          </a>
        </div>
      )}

      <p className="mobile-section-header">Vaccinations Due</p>
      {vaccinationsDue.length === 0 ? (
        <p className="mobile-subtitle">Nothing due right now.</p>
      ) : (
        <ul className="mobile-list">
          {vaccinationsDue.map((v) => {
            const status = dueStatus(v.next_due_date);
            const pillClass = vaccineStatusPillClass(v.next_due_date);
            return (
              <li key={v.id}>
                <div className="mobile-list-item">
                  <span className="mobile-list-title">
                    💉 {v.vaccine_name}
                    {pillClass && (
                      <span className={`client-app-status-pill ${pillClass}`}>
                        {status.className === 'error' ? 'Overdue' : 'Due soon'}
                      </span>
                    )}
                  </span>
                  <span className="mobile-list-meta">Due {formatDate(v.next_due_date)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mobile-section-header">Full History</p>
      {rows.length === 0 ? (
        <p className="mobile-subtitle">No reports or tests recorded yet.</p>
      ) : (
        <ul className="mobile-list">
          {rows.map((row) => {
            const text = reportText(row);
            const pdfHref = reportPdfHref(row);
            return (
              <li key={row.id}>
                <div className="mobile-list-item">
                  <span className="mobile-list-title">
                    {reportKindIcon(row.kind)} {row.kind}
                  </span>
                  <span className="mobile-list-meta">{row.date ? formatDateTime(row.date) : 'Undated'}</span>
                  {text ? (
                    <p className="client-app-report-text">{text}</p>
                  ) : (
                    <span className="mobile-list-meta">No result recorded yet.</span>
                  )}
                  {pdfHref && (
                    <a
                      href={pdfHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="client-app-report-pdf-link"
                    >
                      View PDF
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
