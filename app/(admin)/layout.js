'use client';

import { useEffect, useState } from 'react';
import SearchBox from '../_components/SearchBox';
import { supabase } from '@/lib/supabaseClient';

// Wraps every internal staff page (everything except the public client
// portal under app/portal/) with the nav. Nested inside the bare root
// layout in app/layout.js.
export default function AdminLayout({ children }) {
  const [hasPendingUpdateRequest, setHasPendingUpdateRequest] = useState(false);

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
          <a href="/intake">Intake</a>
          <a href="/appointments">Appointments</a>
          <a href="/consults">Consults</a>
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
          <a href="/shift-tally" title="Shift Tally" aria-label="Shift Tally" className="settings-link">
            💰
          </a>
          <a href="/settings" title="Settings" aria-label="Settings" className="settings-link">
            ⚙️
          </a>
        </div>
      </nav>
      <main className="content">{children}</main>
    </>
  );
}
