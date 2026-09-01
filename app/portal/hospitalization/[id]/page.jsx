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
import { formatTimestamp, wasEdited } from '@/lib/formatTimestamp';

export default function HospitalizationPortalPage() {
  const { id } = useParams();
  const [admission, setAdmission] = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

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
        {notes.map((n) => (
          <div key={n.id} className="portal-note">
            <div className="portal-note-date">{formatTimestamp(n.created_at)}</div>
            {wasEdited(n.created_at, n.updated_at) && (
              <p className="visit-meta" style={{ margin: '0 0 0.4rem' }}>
                Updated {formatTimestamp(n.updated_at)}
              </p>
            )}
            {n.appetite && (
              <p>
                <strong>Appetite:</strong> {n.appetite}
              </p>
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

      <p className="portal-footer">This page updates automatically — no need to refresh.</p>
    </div>
  );
}
