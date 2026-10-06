'use client';

// app/(admin)/cattery/page.jsx
// The cattery overview: the clinic's 7 boarding spaces as they stand today
// (who's in each, who's arriving/leaving), the bookings coming up, and the
// form to book a cat in. Each booking opens its daily care sheet
// (/cattery/[id]) — editable here, printable for the cage, and shared
// with the owner in the client app (/client-app/cattery/[id]).
// Reached from the Cattery nav link, and from a patient's file
// ("🐱 Cattery booking", which pre-picks that cat via ?patient_id=).

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import ClientOrPatientSearch from '@/app/_components/ClientOrPatientSearch';
import {
  CATTERY_SPACES,
  DEFAULT_DEWORMING_PRODUCT,
  DEFAULT_EXTERNAL_PARASITE_PRODUCT,
  catteryToday,
  weightOverdue,
} from '@/lib/cattery';

function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function shortDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
const STATUS_LABELS = { booked: 'Booked', checked_in: 'Checked in', checked_out: 'Checked out', cancelled: 'Cancelled' };

const emptyForm = {
  space_number: '',
  date_in: '',
  date_out: '',
  deworming_done: false,
  deworming_product: DEFAULT_DEWORMING_PRODUCT,
  external_parasite_done: false,
  external_parasite_product: DEFAULT_EXTERNAL_PARASITE_PRODUCT,
  notes: '',
};

function CatteryPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = catteryToday();
  const horizon = addDaysISO(today, 60);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [patient, setPatient] = useState(null);
  const [form, setForm] = useState({ ...emptyForm, date_in: today });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/cattery?from=${addDaysISO(today, -1)}&to=${horizon}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setBookings(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [refreshTick, today, horizon]);

  // Pre-pick the cat when opened from a patient's file.
  useEffect(() => {
    const patientId = searchParams.get('patient_id');
    if (!patientId) return;
    fetch(`/api/patients/${patientId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((p) => p && !p.error && setPatient(p));
  }, [searchParams]);

  const active = bookings.filter((b) => b.status !== 'checked_out');
  const bySpaceToday = useMemo(() => {
    const map = {};
    for (const b of active) if (b.date_in <= today && b.date_out >= today) map[b.space_number] = b;
    return map;
  }, [active, today]);
  const upcoming = active.filter((b) => b.date_in > today);

  async function createBooking(e) {
    e.preventDefault();
    setError(null);
    if (!patient) return setError('Search for and pick the cat first.');
    setSaving(true);
    const res = await fetch('/api/cattery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, patient_id: patient.id }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(data.error || 'Could not save the booking.');
    router.push(`/cattery/${data.id}`);
  }

  function spaceIsFree(space) {
    if (!form.date_in || !form.date_out) return true;
    return !active.some((b) => b.space_number === space && b.date_in <= form.date_out && b.date_out >= form.date_in);
  }

  return (
    <div className="cattery-page">
      <h1>🐱 Cattery</h1>

      <h2>Today, {shortDate(today)}</h2>
      {loading ? (
        <p className="visit-meta">Loading…</p>
      ) : (
        <div className="cattery-spaces">
          {CATTERY_SPACES.map((space) => {
            const b = bySpaceToday[space];
            const overdue = b && weightOverdue(b, b.cattery_daily_logs);
            return (
              <a
                key={space}
                href={b ? `/cattery/${b.id}` : undefined}
                onClick={b ? undefined : () => setForm((f) => ({ ...f, space_number: String(space) }))}
                className={`cattery-space ${b ? 'occupied' : 'free'} ${overdue ? 'overdue' : ''}`}
                title={overdue ? "Today's weight hasn't been recorded" : undefined}
              >
                <span className="cattery-space-number">Space {space}</span>
                {b ? (
                  <>
                    <strong>{b.patients?.name}</strong>
                    <span>{b.clients?.full_name}</span>
                    <span className="visit-meta">
                      {shortDate(b.date_in)} to {shortDate(b.date_out)} · {STATUS_LABELS[b.status]}
                    </span>
                    {overdue && <span className="cattery-overdue">⚖️ Weight not checked today</span>}
                  </>
                ) : (
                  <span className="visit-meta">Free today</span>
                )}
              </a>
            );
          })}
        </div>
      )}

      <h2>Coming up</h2>
      {upcoming.length === 0 ? (
        <p className="visit-meta">No upcoming bookings in the next 60 days.</p>
      ) : (
        <table className="cattery-list">
          <thead>
            <tr><th>Space</th><th>Cat</th><th>Client</th><th>In</th><th>Out</th><th>Status</th></tr>
          </thead>
          <tbody>
            {upcoming.map((b) => (
              <tr key={b.id} onClick={() => router.push(`/cattery/${b.id}`)}>
                <td>{b.space_number}</td>
                <td><a href={`/cattery/${b.id}`}>{b.patients?.name}</a></td>
                <td>{b.clients?.full_name}{b.clients?.client_number ? ` #${b.clients.client_number}` : ''}</td>
                <td>{shortDate(b.date_in)}</td>
                <td>{shortDate(b.date_out)}</td>
                <td>{STATUS_LABELS[b.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>New cattery booking</h2>
      <form className="cattery-form" onSubmit={createBooking}>
        <label>
          Cat
          {patient ? (
            <span className="cattery-picked">
              <strong>{patient.name}</strong> {patient.clients?.full_name ? `(${patient.clients.full_name})` : ''}
              <button type="button" className="mobile-link-btn" onClick={() => setPatient(null)}>Change</button>
            </span>
          ) : (
            <ClientOrPatientSearch placeholder="Search the cat by name, owner or microchip…" onPickPatient={setPatient} onPickClient={() => {}} />
          )}
        </label>
        <div className="cattery-form-row">
          <label>
            Date in
            <input type="date" value={form.date_in} onChange={(e) => setForm({ ...form, date_in: e.target.value })} required />
          </label>
          <label>
            Date out
            <input type="date" value={form.date_out} min={form.date_in || undefined} onChange={(e) => setForm({ ...form, date_out: e.target.value })} required />
          </label>
          <label>
            Space
            <select value={form.space_number} onChange={(e) => setForm({ ...form, space_number: e.target.value })} required>
              <option value="">Pick a space…</option>
              {CATTERY_SPACES.map((s) => (
                <option key={s} value={s} disabled={!spaceIsFree(s)}>
                  Space {s}{spaceIsFree(s) ? '' : ' (booked)'}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="cattery-form-row">
          <label className="cattery-check">
            <input type="checkbox" checked={form.deworming_done} onChange={(e) => setForm({ ...form, deworming_done: e.target.checked })} />
            Deworming given
            <input type="text" value={form.deworming_product} onChange={(e) => setForm({ ...form, deworming_product: e.target.value })} aria-label="Deworming product" />
          </label>
          <label className="cattery-check">
            <input type="checkbox" checked={form.external_parasite_done} onChange={(e) => setForm({ ...form, external_parasite_done: e.target.checked })} />
            External parasite treatment given
            <input type="text" value={form.external_parasite_product} onChange={(e) => setForm({ ...form, external_parasite_product: e.target.value })} aria-label="External parasite product" />
          </label>
        </div>
        <label>
          Notes (staff only)
          <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Diet, medication, owner instructions…" />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={saving}>{saving ? 'Booking…' : 'Book into the cattery'}</button>
      </form>
    </div>
  );
}

export default function CatteryPage() {
  return (
    <Suspense fallback={null}>
      <CatteryPageInner />
    </Suspense>
  );
}
