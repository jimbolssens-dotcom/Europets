// app/portal/hospitalization/[id]/page.jsx
// Client-facing, read-only, live view of one hospitalization: status,
// case photos, and the day-to-day worksheet (with each entry's own
// photos). No staff nav, no edit controls — shared as a link via
// WhatsApp from the staff hospitalization page ("Share Client Portal
// Link"). Updates live as staff add worksheet entries or photos.

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AttachmentGallery from '@/app/_components/AttachmentGallery';
import { formatTime, formatDayHeader, groupNotesByDate } from '@/lib/formatTimestamp';
import { hasCheckinData, buildEmpathicCheckinText } from '@/lib/hospitalizationCheckin';

// Belt-and-suspenders alongside the Cache-Control header in next.config.js:
// this is a "live" page reloaded from the same shared link repeatedly, so
// nothing in the chain (framework, CDN, browser) should ever be allowed to
// serve a stale copy of it.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default function HospitalizationPortalPage() {
  const { id } = useParams();
  const [admission, setAdmission] = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [requestingUpdate, setRequestingUpdate] = useState(false);

  const loadAdmission = () =>
    fetch(`/api/hospitalizations/${id}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        setAdmission(data);
        setLoading(false);
      });

  const loadNotes = () =>
    fetch(`/api/hospitalizations/${id}/notes`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setNotes(Array.isArray(data) ? data : []));

  useEffect(() => {
    loadAdmission();
    loadNotes();

    const channel = supabase
      .channel(`portal-hospitalization-${id}`)
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
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function requestUpdate() {
    setRequestingUpdate(true);
    await fetch(`/api/hospitalizations/${id}/request-update`, { method: 'POST' });
    setRequestingUpdate(false);
    loadAdmission();
  }

  if (loading) return <p className="portal-loading">Loading...</p>;
  if (!admission || admission.error) return <p className="portal-loading">We couldn&apos;t find that page.</p>;

  return (
    <div className="portal-page">
      <header className="portal-header">
        <img src="/logo.png" alt="Europets Clinic" />
        <p className="tagline">Kind, caring, and compassionate veterinary care</p>
      </header>

      <div className="portal-card">
        <h1>
          {admission.patients?.name}
          <span className={`portal-status portal-status-${admission.status}`}>
            {admission.status === 'admitted' ? 'Currently admitted' : 'Discharged'}
          </span>
        </h1>
        <p className="visit-meta">
          Admitted {new Date(admission.admitted_at).toLocaleString()}
          {admission.discharged_at && ` · Discharged ${new Date(admission.discharged_at).toLocaleString()}`}
        </p>
        {admission.reason && <p>{admission.reason}</p>}
        {admission.status === 'admitted' && (
          <div className="portal-update-request">
            <button type="button" onClick={requestUpdate} disabled={requestingUpdate || !!admission.update_requested_at}>
              {requestingUpdate
                ? 'Sending...'
                : admission.update_requested_at
                ? '🔔 Update Requested'
                : '🔔 Request an Update'}
            </button>
            {admission.update_requested_at && (
              <p className="visit-meta">We&apos;ve let the team know — they&apos;ll post an update soon.</p>
            )}
          </div>
        )}
      </div>

      <div className="portal-card">
        <h2>Photos</h2>
        <AttachmentGallery
          entityType="hospitalization"
          entityId={id}
          emptyText="No photos shared yet."
        />
      </div>

      <div className="portal-card">
        <h2>Daily Updates</h2>
        {notes.length === 0 && <p className="visit-meta">No updates yet — check back soon.</p>}
        {groupNotesByDate(notes).map((group) => (
          <div key={group.date} className="worksheet-day">
            <h3 className="worksheet-day-header">{formatDayHeader(group.date)}</h3>
            {group.entries.map((n) => (
              <div key={n.id} className="portal-note">
                <div className="portal-note-date">
                  {formatTime(n.created_at)}
                  {n.staff?.full_name && <span className="portal-note-author"> · {n.staff.full_name}</span>}
                </div>
                {hasCheckinData(n) ? (
                  <p>{n.client_summary || buildEmpathicCheckinText(n, admission.patients?.name)}</p>
                ) : (
                  (n.appetite || n.temperature_c != null || n.weight_kg != null) && (
                    <p>
                      {[
                        n.appetite ? `Appetite: ${n.appetite}` : null,
                        n.temperature_c != null ? `Temp: ${n.temperature_c}°C` : null,
                        n.weight_kg != null ? `Weight: ${n.weight_kg} kg` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )
                )}
                {n.condition && (
                  <p>
                    <strong>Condition:</strong> {n.condition}
                  </p>
                )}
                {n.notes && <p>{n.notes}</p>}
                <AttachmentGallery entityType="hospitalization_note" entityId={n.id} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <p className="portal-footer">This page updates automatically — no need to refresh.</p>
    </div>
  );
}
