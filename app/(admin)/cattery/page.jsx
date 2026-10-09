'use client';

// app/(admin)/cattery/page.jsx
// The Cattery page: the availability planner (the 7 spaces across the
// coming weeks, see CatteryPlanner), the client booking requests waiting
// for approval (reviewed in CatteryRequestReview), today's weight alarms,
// and the staff booking form. Dragging across free days on the planner
// fills that form in. Each booking opens its daily care sheet
// (/cattery/[id]): editable, printable for the cage, and shared with the
// owner in the client app (/client-app/cattery/[id]).
// Reached from the Cattery nav link, and from a patient's file
// ("🐱 Cattery booking", which pre-picks that cat via ?patient_id=).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ClientOrPatientSearch from '@/app/_components/ClientOrPatientSearch';
import CatteryPlanner from '@/app/_components/CatteryPlanner';
import CatteryRequestReview from '@/app/_components/CatteryRequestReview';
import {
  CATTERY_SPACES,
  DEFAULT_DEWORMING_PRODUCT,
  DEFAULT_EXTERNAL_PARASITE_PRODUCT,
  catteryToday,
  weightOverdue,
} from '@/lib/cattery';

const PLANNER_DAYS = 28;

function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function shortDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
function hoursLeft(iso) {
  if (!iso) return '';
  const h = Math.round((new Date(iso).getTime() - Date.now()) / 3600000);
  return h > 0 ? `expires in ${h} h` : 'expires within the hour';
}

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
  const [start, setStart] = useState(today);
  const end = addDaysISO(start, PLANNER_DAYS - 1);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [patient, setPatient] = useState(null);
  const [form, setForm] = useState({ ...emptyForm, date_in: today });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [notice, setNotice] = useState(null);
  const formRef = useRef(null);

  // The planner range plus anything still checked in today, so the
  // weight alarm below covers every cat in the cattery.
  useEffect(() => {
    setLoading(true);
    const from = start < today ? start : today;
    fetch(`/api/cattery?from=${from}&to=${end}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setBookings(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [refreshTick, start, end, today]);

  useEffect(() => {
    const channel = supabase
      .channel('cattery-planner')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cattery_bookings' }, () => setRefreshTick((n) => n + 1))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // Pre-pick the cat when opened from a patient's file.
  useEffect(() => {
    const patientId = searchParams.get('patient_id');
    if (!patientId) return;
    fetch(`/api/patients/${patientId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((p) => p && !p.error && setPatient(p));
  }, [searchParams]);

  const requests = bookings.filter((b) => b.status === 'requested').sort((a, b) => (a.request_expires_at || '').localeCompare(b.request_expires_at || ''));
  const holding = bookings.filter((b) => ['requested', 'booked', 'checked_in'].includes(b.status));
  const overdue = useMemo(() => bookings.filter((b) => weightOverdue(b, b.cattery_daily_logs)), [bookings]);

  // Brings the booking form into view, puts the cursor in its first box
  // (the cat search) and flashes it, so the "+ New booking" button visibly
  // does something even on a screen tall enough to show the form already.
  const focusForm = useCallback(() => {
    const el = formRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.querySelector('input, select, textarea')?.focus({ preventScroll: true });
    el.classList.remove('cattery-form-flash');
    void el.offsetWidth; // restart the animation on repeated clicks
    el.classList.add('cattery-form-flash');
  }, []);

  const pickRange = useCallback(({ space_number, date_in, date_out }) => {
    setForm((f) => ({ ...f, space_number: String(space_number), date_in, date_out }));
    setError(null);
    focusForm();
  }, [focusForm]);

  function openBooking(b) {
    if (b.status === 'requested') setReviewing(b);
    else router.push(`/cattery/${b.id}`);
  }

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
    return !holding.some((b) => b.space_number === space && b.date_in <= form.date_out && b.date_out >= form.date_in);
  }

  return (
    <div className="cattery-page">
      <div className="cattery-planner-head">
        <h1>🐱 Cattery</h1>
        <button type="button" className="secondary" onClick={() => setStart(addDaysISO(start, -7))} aria-label="Previous week">‹</button>
        <button type="button" className="secondary" onClick={() => setStart(today)}>Today</button>
        <button type="button" className="secondary" onClick={() => setStart(addDaysISO(start, 7))} aria-label="Next week">›</button>
        <strong>{shortDate(start)} to {shortDate(end)}</strong>
        <span className="spacer" />
        <button type="button" onClick={focusForm}>+ New booking</button>
      </div>

      {overdue.map((b) => (
        <a key={b.id} href={`/cattery/${b.id}`} className="cattery-overdue-banner cattery-overdue-link">
          ⚖️ {b.patients?.name} (space {b.space_number}) hasn&apos;t been weighed today. Tap to record the weight.
        </a>
      ))}

      {notice && <p className="cattery-notice">{notice}</p>}

      {requests.length > 0 && (
        <div className="cattery-requests">
          <h2>🔔 {requests.length} booking request{requests.length === 1 ? '' : 's'} waiting for approval</h2>
          {requests.map((b) => (
            <div key={b.id} className="cattery-request">
              <strong>{b.patients?.name}</strong>
              <span className="visit-meta">
                {b.clients?.full_name}{b.clients?.client_number ? ` #${b.clients.client_number}` : ''} · Space {b.space_number} · {shortDate(b.date_in)} to {shortDate(b.date_out)}
              </span>
              <span className="cattery-request-expiry">{hoursLeft(b.request_expires_at)}</span>
              <span className="spacer" />
              <button type="button" onClick={() => setReviewing(b)}>Review</button>
            </div>
          ))}
        </div>
      )}

      <div className="cattery-legend">
        <span><i className="cattery-swatch checked" />Checked in</span>
        <span><i className="cattery-swatch booked" />Booked (confirmed)</span>
        <span><i className="cattery-swatch pending" />Requested by client, waiting for approval</span>
        <span><i className="cattery-swatch out" />Checked out</span>
      </div>
      {loading && bookings.length === 0 ? (
        <p className="visit-meta">Loading…</p>
      ) : (
        <CatteryPlanner start={start} days={PLANNER_DAYS} today={today} bookings={bookings} onOpen={openBooking} onPickRange={pickRange} />
      )}
      <p className="visit-meta">Tap a bar to open that booking or review a request. Drag across free days in a space (or tap a free day) to start a new booking there.</p>

      <h2>New cattery booking</h2>
      <form className="cattery-form" onSubmit={createBooking} ref={formRef}>
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

      {reviewing && (
        <CatteryRequestReview
          booking={reviewing}
          onClose={() => setReviewing(null)}
          onDone={(data) => {
            setReviewing(null);
            setNotice(
              data.status === 'declined'
                ? `Request for ${reviewing.patients?.name} declined. The client has been told.`
                : `${reviewing.patients?.name} is booked into space ${data.space_number}. ${data.consent?.whatsapp?.sent ? 'The consent form has been sent on WhatsApp.' : `Consent form not sent on WhatsApp${data.consent?.whatsapp?.reason ? `: ${data.consent.whatsapp.reason}` : ''}. You can resend it from the booking sheet.`}`
            );
            setRefreshTick((n) => n + 1);
          }}
        />
      )}
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
