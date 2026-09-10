'use client';

import { useEffect, useState } from 'react';
import SearchBox from '../_components/SearchBox';
import AppVersionWatcher from '../_components/AppVersionWatcher';
import CultureReminderBanner from '../_components/CultureReminderBanner';
import { useHospitalizationUpdatePending } from '../_components/useHospitalizationUpdatePending';
import { supabase } from '@/lib/supabaseClient';

// Wraps every internal staff page (everything except the public client
// portal under app/portal/) with the nav. Nested inside the bare root
// layout in app/layout.js.
export default function AdminLayout({ children }) {
  const hasPendingHospitalizationUpdate = useHospitalizationUpdatePending();
  const [hasPendingAppointmentRequest, setHasPendingAppointmentRequest] = useState(false);
  const [hasPendingInviteRequest, setHasPendingInviteRequest] = useState(false);
  const [hasPendingReviewRequest, setHasPendingReviewRequest] = useState(false);

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

  return (
    <>
      <AppVersionWatcher />
      <nav className="topnav">
        <a href="/" className="brand">
          <img src="/logo.png" alt="Europets Clinic" />
        </a>
        <SearchBox />
        <div className="topnav-links">
          <a href="/search">Search</a>
          <a href="/add">Add</a>
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
            href="/hospitalization"
            className={hasPendingHospitalizationUpdate ? 'nav-update-requested' : ''}
            title={hasPendingHospitalizationUpdate ? 'A hospitalization update needs attention' : undefined}
          >
            Hospitalization{hasPendingHospitalizationUpdate && ' 🔔'}
          </a>
          <a href="/vaccinations">Vaccinations</a>
          <a href="/imaging-reports">Imaging Reports</a>
          <a href="/invoices">Invoices</a>
          <a href="/mobile" title="Mobile recording app" aria-label="Mobile recording app" className="settings-link">
            📱
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
