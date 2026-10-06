'use client';

// app/client-app/cattery/page.js
// The logged-in client's cattery stays: a Book a stay button
// (app/client-app/cattery/new), then anything current, coming up or
// waiting for the clinic's confirmation, then past stays and answered
// requests, each opening that stay (app/client-app/cattery/[id]). Uses GET
// /api/cattery?client_id=, which checks the session is that client's.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClientAppSession } from '@/app/_components/useClientAppSession';
import { catteryToday } from '@/lib/cattery';

const STATUS_PILL = {
  requested: '⏳ Waiting for confirmation',
  booked: 'Confirmed',
  checked_in: 'Confirmed',
  declined: 'Not confirmed',
  expired: 'Request expired',
};

function shortDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default function ClientAppCatteryPage() {
  const { clientId, ready } = useClientAppSession();
  const router = useRouter();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ready && !clientId) router.replace('/client-app');
  }, [ready, clientId, router]);

  useEffect(() => {
    if (!ready || !clientId) return;
    fetch(`/api/cattery?client_id=${clientId}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setBookings(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [ready, clientId]);

  if (!ready || !clientId) return null;

  const today = catteryToday();
  const OPEN = ['requested', 'booked', 'checked_in'];
  const current = bookings
    .filter((b) => OPEN.includes(b.status) && b.date_out >= today)
    .sort((a, b) => a.date_in.localeCompare(b.date_in));
  const past = bookings.filter((b) => !current.includes(b));

  const row = (b) => (
    <li key={b.id}>
      <a href={`/client-app/cattery/${b.id}`} className="mobile-list-item client-app-pet-card">
        <div className="client-app-pet-card-row">
          <span className="client-app-pet-avatar-sm client-app-pet-avatar-placeholder">🐱</span>
          <div>
            <span className="mobile-list-title">
              {b.patients?.name}
              <span className={`client-app-cattery-pill ${b.status}`}>{STATUS_PILL[b.status] || ''}</span>
            </span>
            <span className="mobile-list-meta">
              {shortDate(b.date_in)} to {shortDate(b.date_out)} · Space {b.space_number}
              {b.status === 'checked_in' ? ' · Staying with us now' : b.status === 'checked_out' ? ' · Back home' : ''}
              {b.status === 'requested' ? ' · The clinic will confirm within 48 hours' : ''}
              {b.status === 'declined' && b.decline_reason ? ` · ${b.decline_reason}` : ''}
            </span>
          </div>
        </div>
      </a>
    </li>
  );

  return (
    <div className="mobile-page client-app-cattery-page">
      <h1>Cattery</h1>
      <a href="/client-app/cattery/new" className="client-app-cattery-book">🐱 Book a cattery stay</a>
      {loading ? (
        <p className="mobile-subtitle">Loading...</p>
      ) : bookings.length === 0 ? (
        <p className="mobile-subtitle">No cattery stays yet.</p>
      ) : (
        <>
          {current.length > 0 && <ul className="mobile-list">{current.map(row)}</ul>}
          {past.length > 0 && (
            <>
              <h2 className="mobile-section-header">Past stays and requests</h2>
              <ul className="mobile-list">{past.map(row)}</ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
