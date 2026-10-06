'use client';

// app/portal/cattery/[id]/page.jsx
// The owner's cattery care page: their cat's stay (space, dates,
// deworming/flea treatment), a weight trend, and each day's update and
// photos from the team. Opened from the link staff copy on the cattery
// sheet ("Copy owner link"), or from the client app (?app=1 adds the
// Home link), same model as app/portal/hospitalization/[id]: the booking's
// UUID in the URL is the link, and GET /api/cattery/[id] strips the
// staff-only notes/comments for anyone not logged in as staff.
// Refreshes live as staff save the daily sheet.

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import AttachmentGallery from '@/app/_components/AttachmentGallery';
import WeightHistoryChart from '@/app/_components/WeightHistoryChart';

function longDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}
function shortDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
const STATUS_TEXT = {
  booked: 'Booked',
  checked_in: 'Staying with us',
  checked_out: 'Back home',
};
const FOOD_TEXT = { All: 'ate everything', Most: 'ate most of it', Some: 'ate a little', None: "didn't eat" };

export default function CatteryPortalPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const fromApp = searchParams.get('app') === '1';
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      fetch(`/api/cattery/${id}`, { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => setBooking(data && !data.error ? data : null))
        .finally(() => setLoading(false));
    load();
    const channel = supabase
      .channel(`portal-cattery-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cattery_daily_logs', filter: `booking_id=eq.${id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cattery_bookings', filter: `id=eq.${id}` }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [id]);

  if (loading) return <div className="client-app"><p className="portal-loading">Loading...</p></div>;
  if (!booking || booking.status === 'cancelled') {
    return <div className="client-app"><p className="portal-loading">We couldn&apos;t find that page.</p></div>;
  }

  const name = booking.patients?.name || 'Your cat';
  const logs = (booking.cattery_daily_logs || []).slice().sort((a, b) => b.log_date.localeCompare(a.log_date));
  const weights = logs.filter((l) => l.weight_kg != null).map((l) => ({ date: `${l.log_date}T12:00:00Z`, weight_kg: l.weight_kg }));
  const shownDays = logs.filter((l) => l.weight_kg != null || l.food_am || l.food_pm || l.update_for_owner);

  return (
    <div className="client-app">
      <div className="portal-page">
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
            🐱 {name}
            <span className={`portal-status portal-status-${booking.status === 'checked_in' ? 'admitted' : 'discharged'}`}>
              {STATUS_TEXT[booking.status] || ''}
            </span>
            <WeightHistoryChart data={weights} mini />
          </h1>
          <p className="visit-meta">
            Cattery stay · {shortDate(booking.date_in)} to {shortDate(booking.date_out)} · Space {booking.space_number}
          </p>
          <p>
            Deworming: {booking.deworming_done ? `✅ given${booking.deworming_product ? ` (${booking.deworming_product})` : ''}` : 'not given'}
            <br />
            Flea and tick treatment: {booking.external_parasite_done ? `✅ given${booking.external_parasite_product ? ` (${booking.external_parasite_product})` : ''}` : 'not given'}
          </p>
        </div>

        <div className="portal-card">
          <h2>Daily Updates</h2>
          {shownDays.length === 0 && <p className="visit-meta">No updates yet, check back soon.</p>}
          {shownDays.map((l) => (
            <div key={l.id} className="portal-note">
              <div className="portal-note-date">{longDate(l.log_date)}</div>
              <p className="visit-meta">
                {[
                  l.weight_kg != null && `Weight ${Number(l.weight_kg).toFixed(2)} kg`,
                  l.food_am && `Morning: ${FOOD_TEXT[l.food_am] || l.food_am}`,
                  l.food_pm && `Evening: ${FOOD_TEXT[l.food_pm] || l.food_pm}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {l.update_for_owner && <p>{l.update_for_owner}</p>}
              <AttachmentGallery entityType="cattery_log" entityId={l.id} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
