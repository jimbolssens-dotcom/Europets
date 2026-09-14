// app/portal/hospitalization/[id]/page.jsx
// Client-facing, read-only, live view of one hospitalization: status,
// case photos, and the day-to-day worksheet (with each entry's own
// photos). No staff nav, no edit controls — shared as a link via
// WhatsApp from the staff hospitalization page ("Share Client Portal
// Link"). Updates live as staff add worksheet entries or photos.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AttachmentGallery from '@/app/_components/AttachmentGallery';
import { formatTime, formatDateTime, formatDayHeader, groupNotesByDate } from '@/lib/formatTimestamp';
import { hasCheckinData, buildEmpathicCheckinText } from '@/lib/hospitalizationCheckin';
import { isWithinOfficeHours, OFFICE_HOURS_LABEL } from '@/lib/officeHours';

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
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const chatThreadRef = useRef(null);

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

  const loadMessages = () =>
    fetch(`/api/hospitalizations/${id}/messages`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setMessages(Array.isArray(data) ? data : []));

  useEffect(() => {
    loadAdmission();
    loadNotes();
    loadMessages();

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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hospitalization_messages', filter: `hospitalization_id=eq.${id}` },
        loadMessages
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // The thread is a fixed-height scroll box (see .portal-chat-thread) —
  // without this it stays scrolled to the top, so a growing conversation
  // shows the oldest messages instead of the latest one.
  useEffect(() => {
    if (chatThreadRef.current) {
      chatThreadRef.current.scrollTop = chatThreadRef.current.scrollHeight;
    }
  }, [messages]);

  async function sendMessage(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    await fetch(`/api/hospitalizations/${id}/request-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });
    setSending(false);
    setDraft('');
    loadMessages();
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
      </div>

      {admission.status === 'admitted' && (
        <div className="portal-card">
          <h2>Message the Team</h2>
          <div className="portal-chat-thread" ref={chatThreadRef}>
            {messages.length === 0 && (
              <p className="visit-meta">Ask us anything about {admission.patients?.name || 'your pet'} — we'll reply right here.</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`portal-chat-bubble portal-chat-bubble-${m.sender === 'client' ? 'mine' : 'theirs'}`}>
                <p>{m.body}</p>
                <span className="portal-chat-bubble-meta">
                  {m.sender === 'staff' ? m.staff?.full_name || 'Europets Team' : 'You'} · {formatDateTime(m.created_at)}
                </span>
              </div>
            ))}
          </div>
          <form className="portal-chat-form" onSubmit={sendMessage}>
            <textarea
              rows={2}
              maxLength={2000}
              placeholder="e.g. Is she eating yet?"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" disabled={sending || !draft.trim()}>
              {sending ? 'Sending...' : 'Send'}
            </button>
          </form>
          {!isWithinOfficeHours(new Date()) && (
            <p className="visit-meta">
              You've reached us outside office hours ({OFFICE_HOURS_LABEL}) — we'll reply once we're back in the office.
            </p>
          )}
        </div>
      )}

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
