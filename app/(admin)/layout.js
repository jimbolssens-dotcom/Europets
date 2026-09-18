'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import AppVersionWatcher from '../_components/AppVersionWatcher';
import CultureReminderBanner from '../_components/CultureReminderBanner';
import { useHospitalizationUpdatePending } from '../_components/useHospitalizationUpdatePending';
import { navAlarmClass } from '@/lib/hospitalizationAttention';
import { supabase } from '@/lib/supabaseClient';

// A short two-note chime for a new client message arriving — there's no
// notification sound asset anywhere in this app yet, so this follows the
// one existing precedent (the roster-conflict beep on the Appointments
// page) rather than adding an audio file: a synthesized Web Audio API
// oscillator, silently no-opping if AudioContext is unavailable (e.g. no
// user gesture has unlocked audio yet in some browsers).
function playMessageAlertChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    [660, 880].forEach((freq, i) => {
      const start = ctx.currentTime + i * 0.14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  } catch {}
}

// Wraps every internal staff page (everything except the public client
// portal under app/portal/) with the nav. Nested inside the bare root
// layout in app/layout.js.
export default function AdminLayout({ children }) {
  const pathname = usePathname();
  // Split by kind (default 'admission' for the first) because the
  // Hospitalization link opens the Cage Layout page, which only ever
  // shows kind='admission' cases — day procedures have their own separate
  // page/wall, so an alarm on one needs its own bell here rather than
  // lighting up a link with no cage anywhere to show it on.
  const hospitalizationAlarmLevel = useHospitalizationUpdatePending();
  const hospitalizationAlarmClass = navAlarmClass(hospitalizationAlarmLevel);
  const hospitalizationAlarmIcon =
    hospitalizationAlarmLevel === 'red' || hospitalizationAlarmLevel === 'both' ? ' 🩺' : hospitalizationAlarmLevel === 'yellow' ? ' 🔔' : '';
  const dayProcedureAlarmLevel = useHospitalizationUpdatePending({ kind: 'day_procedure' });
  const dayProcedureAlarmClass = navAlarmClass(dayProcedureAlarmLevel);
  const dayProcedureAlarmIcon =
    dayProcedureAlarmLevel === 'red' || dayProcedureAlarmLevel === 'both' ? ' 🩺' : dayProcedureAlarmLevel === 'yellow' ? ' 🔔' : '';
  const [hasPendingAppointmentRequest, setHasPendingAppointmentRequest] = useState(false);
  const [hasPendingInviteRequest, setHasPendingInviteRequest] = useState(false);
  const [hasPendingReviewRequest, setHasPendingReviewRequest] = useState(false);
  const [hasPendingClientMessage, setHasPendingClientMessage] = useState(false);
  const pendingClientMessageRef = useRef(false);

  // Same blinking treatment for a client-app chat message waiting on a
  // reply (see app/messages and client_messages / migration 120) — plus a
  // chime the moment it flips from "nothing pending" to "something's
  // pending" (not on every poll/mount), since this is the one nav item the
  // clinic asked to actually be noticed away from the screen.
  useEffect(() => {
    const checkPending = () =>
      fetch('/api/client-messages')
        .then((res) => res.json())
        .then((data) => {
          const pending = Array.isArray(data) && data.some((c) => c.pending);
          if (pending && !pendingClientMessageRef.current) playMessageAlertChime();
          pendingClientMessageRef.current = pending;
          setHasPendingClientMessage(pending);
        });

    checkPending();

    const channel = supabase
      .channel('nav-client-messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_messages' }, checkPending)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // Same blinking treatment for a submitted intake/invite request awaiting
  // review — Appointments if it also asked for a slot (reviewed there, see
  // AppointmentRequestsPanel), Invite otherwise (see IntakeReviewCard) —
  // so staff notice a pending review from anywhere in the app.
  useEffect(() => {
    const checkPending = () =>
      fetch('/api/intake-requests')
        .then((res) => res.json())
        .then((data) => {
          const list = Array.isArray(data) ? data : [];
          const submitted = list.filter((r) => r.status === 'submitted');
          setHasPendingAppointmentRequest(submitted.some((r) => r.appointment_type));
          setHasPendingInviteRequest(submitted.some((r) => !r.appointment_type));
        });

    checkPending();

    const channel = supabase
      .channel('nav-intake-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intake_requests' }, checkPending)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // Same blinking treatment for a submitted review awaiting moderation —
  // see app/(admin)/reviews and website/app/reviews/submit/[id].
  useEffect(() => {
    const checkPending = () =>
      fetch('/api/review-requests')
        .then((res) => res.json())
        .then((data) => {
          const list = Array.isArray(data) ? data : [];
          setHasPendingReviewRequest(list.some((r) => r.status === 'submitted'));
        });

    checkPending();

    const channel = supabase
      .channel('nav-review-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'review_requests' }, checkPending)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  async function logOut() {
    await fetch('/api/login', { method: 'DELETE' });
    window.location.href = '/login';
  }

  if (pathname === '/hospitalization/wall' || pathname === '/day-procedures/wall') {
    return <><AppVersionWatcher /><main>{children}</main></>;
  }

  return (
    <>
      <AppVersionWatcher />
      <nav className="topnav">
        <a href="/" className="brand">
          <img src="/logo.png" alt="Europets Clinic" />
        </a>
        <div className="topnav-links">
          <a href="/search">Search</a>
          <a href="/add">Add</a>
          <a
            href="/messages"
            className={hasPendingClientMessage ? 'nav-update-requested' : ''}
            title={hasPendingClientMessage ? 'A client is waiting on a reply' : undefined}
          >
            Messages{hasPendingClientMessage && ' 🔔'}
          </a>
          <a
            href="/intake"
            className={hasPendingInviteRequest ? 'nav-update-requested' : ''}
            title={hasPendingInviteRequest ? 'A submission is waiting for review' : undefined}
          >
            Invite{hasPendingInviteRequest && ' 🔔'}
          </a>
          <a
            href="/appointments"
            className={hasPendingAppointmentRequest ? 'nav-update-requested' : ''}
            title={hasPendingAppointmentRequest ? 'An appointment request is waiting for review' : undefined}
          >
            Appointments{hasPendingAppointmentRequest && ' 🔔'}
          </a>
          <a href="/consults">Consults</a>
          <a
            href="/day-procedures"
            className={dayProcedureAlarmClass}
            title={dayProcedureAlarmLevel !== 'none' ? 'A day procedure needs attention' : undefined}
          >
            Day Procedures{dayProcedureAlarmIcon}
          </a>
          <a
            href="/hospitalization"
            className={hospitalizationAlarmClass}
            title={hospitalizationAlarmLevel !== 'none' ? 'A hospitalization needs attention' : undefined}
          >
            Hospitalization{hospitalizationAlarmIcon}
          </a>
          <a href="/vaccinations">Vaccinations</a>
          <a href="/invoices">Invoices</a>
          <a href="/hospitalization/wall" title="Hospitalization wall display" aria-label="Hospitalization wall display" className="settings-link">
            🗺️
          </a>
          <a href="/day-procedures/wall" title="Day procedure wall display" aria-label="Day procedure wall display" className="settings-link">
            🩺
          </a>
          <a href="/mobile" title="Mobile recording app" aria-label="Mobile recording app" className="settings-link">
            📱
          </a>
          <a href="/client-app" title="Client app" aria-label="Client app" className="settings-link">
            🐾
          </a>
          <a
            href="/settings"
            title={hasPendingReviewRequest ? 'Settings — a review is waiting for moderation' : 'Settings'}
            aria-label="Settings"
            className={`settings-link${hasPendingReviewRequest ? ' nav-update-requested' : ''}`}
          >
            ⚙️{hasPendingReviewRequest && ' 🔔'}
          </a>
          <button
            type="button"
            onClick={logOut}
            title="Log out"
            aria-label="Log out"
            className="settings-link"
          >
            🚪
          </button>
        </div>
      </nav>
      <CultureReminderBanner />
      <main className="content">{children}</main>
    </>
  );
}
