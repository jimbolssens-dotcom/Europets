'use client';

import { useEffect, useState } from 'react';
import SearchBox from '../_components/SearchBox';
import { supabase } from '@/lib/supabaseClient';

// Wraps every internal staff page (everything except the public client
// portal under app/portal/) with the nav. Nested inside the bare root
// layout in app/layout.js.
export default function AdminLayout({ children }) {
  const [hasPendingUpdateRequest, setHasPendingUpdateRequest] = useState(false);
  const [hasPendingAppointmentRequest, setHasPendingAppointmentRequest] = useState(false);
  const [hasPendingInviteRequest, setHasPendingInviteRequest] = useState(false);
  const [hasPendingReviewRequest, setHasPendingReviewRequest] = useState(false);

  // The Hospitalization nav link blinks the same way an individual cage
  // does on the Cage Layout page (see .cage-update-requested there) —
  // whenever ANY admitted case has a pending "Request an Update" from the
  // client portal, so staff notice it from any page in the app, not just
  // while already looking at the cage layout.
  useEffect(() => {
    const checkPending = () =>
      fetch('/api/hospitalizations?status=admitted')
        .then((res) => res.json())
        .then((data) => {
          const list = Array.isArray(data) ? data : [];
          setHasPendingUpdateRequest(list.some((h) => h.update_requested_at));
        });

    checkPending();

    const channel = supabase
      .channel('nav-hospitalization-update-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitalizations' }, checkPending)
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

  return (
    <>
      <nav className="topnav">
        <a href="/" className="brand">
          <img src="/logo.png" alt="Europets Clinic" />
        </a>
        <SearchBox />
        <div className="topnav-links">
          <a href="/clients">Clients</a>
          <a href="/patients">Patients</a>
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
            href="/reviews"
            className={hasPendingReviewRequest ? 'nav-update-requested' : ''}
            title={hasPendingReviewRequest ? 'A review is waiting for moderation' : undefined}
          >
            Reviews{hasPendingReviewRequest && ' 🔔'}
          </a>
          <a
            href="/hospitalization"
            className={hasPendingUpdateRequest ? 'nav-update-requested' : ''}
            title={hasPendingUpdateRequest ? 'A client is waiting for an update' : undefined}
          >
            Hospitalization{hasPendingUpdateRequest && ' 🔔'}
          </a>
          <a href="/vaccinations">Vaccinations</a>
          <a href="/invoices">Invoices</a>
          <a href="/accounting">Accounting</a>
          <a href="/catalog">Catalog</a>
          <a href="/mobile" title="Mobile recording app" aria-label="Mobile recording app" className="settings-link">
            📱
          </a>
          <a href="/settings" title="Settings" aria-label="Settings" className="settings-link">
            ⚙️
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
      <main className="content">{children}</main>
    </>
  );
}
