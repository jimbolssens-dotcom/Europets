// app/portal/hospitalization/[id]/page.jsx
// Client-facing, read-only, live view of one hospitalization: status,
// case photos, any dental/surgical/ultrasound/x-ray/gastroscopy reports
// (each with its own photos — see GET /api/hospitalizations/:id/reports),
// and the day-to-day worksheet (with each entry's own photos). No staff
// nav, no edit controls — shared as a link via WhatsApp from the staff
// hospitalization page ("Share Client Portal Link"). Updates live as
// staff add worksheet entries, generate/edit a report, or add photos.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import AttachmentGallery from '@/app/_components/AttachmentGallery';
import WeightHistoryChart from '@/app/_components/WeightHistoryChart';
import TemperatureHistoryChart from '@/app/_components/TemperatureHistoryChart';
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
  const searchParams = useSearchParams();
  // Set by every link the client app itself generates (see app/client-app/
  // pets/[id], app/client-app/pets and app/client-app/page) — never present
  // on a link sent straight from the desktop to someone with no client-app
  // account, who has nowhere to go "home" to. Drives both the dark theme
  // below and the "← Home" link.
  const fromApp = searchParams.get('app') === '1';
  const [admission, setAdmission] = useState(null);
  const [notes, setNotes] = useState([]);
  const [messages, setMessages] = useState([]);
  const [reports, setReports] = useState([]);
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

  const loadReports = () =>
    fetch(`/api/hospitalizations/${id}/reports`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setReports(Array.isArray(data) ? data : []));

  useEffect(() => {
    loadAdmission();
    loadNotes();
    loadMessages();
    loadReports();

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dental_reports', filter: `hospitalization_id=eq.${id}` }, loadReports)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'surgical_reports', filter: `hospitalization_id=eq.${id}` }, loadReports)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ultrasound_reports', filter: `hospitalization_id=eq.${id}` }, loadReports)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'xray_reports', filter: `hospitalization_id=eq.${id}` }, loadReports)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastroscopy_reports', filter: `hospitalization_id=eq.${id}` }, loadReports)
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // The thread is a fixed-height scroll box (see .portal-chat-thread) —
  // without this it stays scrolled to the top, so a growing conversation
  // shows the oldest messages instead of the latest one. Also depends on
  // `loading`: the page renders nothing but a loading message (see the
  // `if (loading) return ...` below) until it flips to false, so this ref
  // doesn't exist yet on the render where messages was actually set —
  // without loading in the deps, the one render where the ref first
  // becomes non-null wouldn't rerun this effect.
  useEffect(() => {
    if (chatThreadRef.current) {
      chatThreadRef.current.scrollTop = chatThreadRef.current.scrollHeight;
    }
  }, [messages, loading]);

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

  // Same created_at-based (not note_date) derivation as the staff
  // hospitalization page's own mini sparklines — using note_date would
  // collapse several same-day readings into one point on the chart.
  const stayWeightHistory = notes
    .filter((n) => n.weight_kg != null)
    .map((n) => ({ date: n.created_at, weight_kg: n.weight_kg }));
  const stayTemperatureHistory = notes
    .filter((n) => n.temperature_c != null)
    .map((n) => ({ date: n.created_at, temperature_c: n.temperature_c }));

  if (loading) return <p className="portal-loading">Loading...</p>;
  if (!admission || admission.error) return <p className="portal-loading">We couldn&apos;t find that page.</p>;

  return (
    <div className={`portal-page${fromApp ? ' client-app' : ''}`}>
      {fromApp && (
        <Link href="/client-app" className="mobile-link-btn portal-home-link">
          ← Home
        </Link>
      )}
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
          <WeightHistoryChart data={stayWeightHistory} mini />
          <TemperatureHistoryChart data={stayTemperatureHistory} mini />
        </h1>
        <p className="visit-meta">
          Admitted {formatDateTime(admission.admitted_at)}
          {admission.discharged_at && ` · Discharged ${formatDateTime(admission.discharged_at)}`}
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

      {reports.length > 0 && (
        <div className="portal-card">
          <h2>Reports</h2>
          {reports.map((r) => (
            <div key={r.id} className="portal-note">
              <div className="portal-note-date">
                {r.label} · {formatDateTime(r.performed_at)}
              </div>
              <p>{r.text}</p>
              <AttachmentGallery entityType={r.entityType} entityId={r.id} />
            </div>
          ))}
        </div>
      )}

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
