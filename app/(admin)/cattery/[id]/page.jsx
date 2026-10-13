'use client';

// app/(admin)/cattery/[id]/page.jsx
// One cattery booking's daily care sheet — the digital version of the
// paper sheet clipped to the cage. Staff fill in each day's weight, AM/PM
// food, litter, a check tick and internal comments, plus an optional
// "update for owner" with photos that the client sees on their cattery
// cattery page in the client app (/client-app/cattery/[id]). Every field saves as soon as it's
// changed (PUT /api/cattery/[id]/logs).
//
// Print renders a clean cage sheet in the paper layout (cat, client #,
// date in/out, treatments, one row per day, weekends shaded) with
// whatever has been filled in so far and blank boxes for the rest.
//
// Today's row goes red after 18:00 Dubai time if the weight still hasn't
// been recorded, the same rule that lights the Cattery nav alarm
// (see lib/cattery.js's weightOverdue).

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AttachmentSection from '@/app/_components/AttachmentSection';
import WeightHistoryChart from '@/app/_components/WeightHistoryChart';
import CatteryInvoiceButton from '@/app/_components/CatteryInvoiceButton';
import { MOBILE_STAFF_STORAGE_KEY } from '@/app/_components/useMobileStaff';
import {
  CATTERY_SPACES,
  bookingDays,
  catteryToday,
  isWeekend,
  weekdayName,
  weightOverdue,
  bookingCats,
  catNames,
  logPatientId,
} from '@/lib/cattery';

const FOOD_OPTIONS = ['', 'All', 'Most', 'Some', 'None'];
const LITTER_OPTIONS = ['', 'Normal', 'Changed', 'Diarrhoea', 'None'];
const STATUS_LABELS = {
  requested: 'Requested by client, waiting for approval',
  booked: 'Booked',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  cancelled: 'Cancelled',
  declined: 'Declined',
  expired: 'Request expired',
};

function longDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
// "Plomo's", "Chubbers'".
function possessive(name) {
  return /s$/i.test(name || '') ? `${name}'` : `${name}'s`;
}
function shortDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
}

export default function CatteryBookingPage() {
  const { id } = useParams();
  const [booking, setBooking] = useState(null);
  const [logs, setLogs] = useState({}); // `${patient_id}|${log_date}` -> row (one per cat per day)
  const [householdCats, setHouseholdCats] = useState(null); // the owner's other cats, to add to a shared space
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [error, setError] = useState(null);
  const [sendingConsent, setSendingConsent] = useState(false);
  const [consentMessage, setConsentMessage] = useState(null);
  const [openDay, setOpenDay] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const today = catteryToday();

  function load() {
    return fetch(`/api/cattery/${id}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) return setBooking(null);
        setBooking(data);
        const map = {};
        for (const l of data.cattery_daily_logs || []) map[`${logPatientId(l, data)}|${l.log_date}`] = l;
        setLogs(map);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`cattery-sheet-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cattery_daily_logs', filter: `booking_id=eq.${id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cattery_booking_cats', filter: `booking_id=eq.${id}` }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const days = useMemo(() => (booking ? bookingDays(booking.date_in, booking.date_out) : []), [booking]);
  // Every cat on the booking: a shared bungalow (migration 183) has one
  // row per cat per day on the sheet.
  const cats = useMemo(() => bookingCats(booking), [booking]);
  const shared = cats.length > 1;
  const overdueToday = booking && weightOverdue(booking, Object.values(logs));
  const overdueNames = cats
    .filter((cat) => booking && weightOverdue(booking, Object.values(logs), undefined, cat.id))
    .map((cat) => cat.name)
    .join(' and ');
  // This stay's daily weigh-ins per cat, for the weight graph(s) under the header.
  const stayWeights = useMemo(
    () =>
      cats.map((cat) => ({
        cat,
        points: Object.values(logs)
          .filter((l) => logPatientId(l, booking) === cat.id && l.weight_kg != null && l.weight_kg !== '')
          .map((l) => ({ date: `${l.log_date}T12:00:00+04:00`, weight_kg: l.weight_kg })),
      })),
    [logs, cats, booking]
  );

  async function saveLog(date, field, value, catId) {
    setError(null);
    const key = `${catId}|${date}`;
    setLogs((prev) => ({ ...prev, [key]: { ...(prev[key] || { log_date: date, patient_id: catId }), [field]: value } }));
    setSavingKey(`${key}:${field}`);
    let recordedBy = null;
    try { recordedBy = localStorage.getItem(MOBILE_STAFF_STORAGE_KEY); } catch {}
    const res = await fetch(`/api/cattery/${id}/logs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log_date: date, patient_id: catId, [field]: value, ...(recordedBy ? { recorded_by: recordedBy } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingKey(null);
    if (!res.ok) return setError(data.error || 'Could not save.');
    setLogs((prev) => ({ ...prev, [key]: data }));
  }

  // The owner's other cats, for "+ Add cat" (sharing this space).
  function loadHouseholdCats() {
    if (!booking?.client_id) return;
    fetch(`/api/patients?client_id=${booking.client_id}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((pets) =>
        setHouseholdCats(
          (Array.isArray(pets) ? pets : []).filter(
            (p) => !cats.some((c) => c.id === p.id) && !p.deceased && !p.rehomed && /cat|feline/i.test(p.species || '')
          )
        )
      );
  }

  async function changeCats(update) {
    setError(null);
    const res = await fetch(`/api/cattery/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error || 'Could not change the cats on this booking.');
    setHouseholdCats(null);
    load();
  }

  // Sends (or resends) the cattery consent form to the owner on WhatsApp.
  // The first one goes out automatically when the booking is made.
  async function sendConsent() {
    setSendingConsent(true);
    setConsentMessage(null);
    const res = await fetch('/api/consent-form-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cattery_booking_id: id, form_type: 'cattery' }),
    });
    const data = await res.json().catch(() => ({}));
    setSendingConsent(false);
    if (!res.ok) return setConsentMessage(data.error || 'Could not send the consent form.');
    setConsentMessage(data.whatsapp?.sent ? 'Sent on WhatsApp.' : `Not sent on WhatsApp: ${data.whatsapp?.reason || 'unknown reason'}.`);
    load();
  }

  async function patchBooking(update) {
    setError(null);
    const res = await fetch(`/api/cattery/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Could not update the booking.');
      return false;
    }
    await load();
    return true;
  }

  if (loading) return <p className="visit-meta">Loading…</p>;
  if (!booking) return <p>Booking not found. <a href="/cattery">Back to the cattery</a></p>;

  const p = booking.patients || {};
  const c = booking.clients || {};

  return (
    <div className="cattery-sheet-page">
      <div className="cattery-sheet-actions no-print">
        <a href="/cattery">&larr; Cattery</a>
        <span className="spacer" />
        <span className="visit-meta" title="Owners see this stay, its daily updates and photos under Cattery in the client app">
          📱<span className="phone-hide"> Owner sees this in the client app</span>
        </span>
        {!['declined', 'expired'].includes(booking.status) && (
          <CatteryInvoiceButton bookingId={id} canCreate={!['requested', 'cancelled'].includes(booking.status)} />
        )}
        <button type="button" className="button-link" onClick={() => window.print()} title="Print cage sheet">🖨️<span className="phone-hide"> Print cage sheet</span></button>
      </div>

      {overdueToday && (
        <p className="cattery-overdue-banner no-print">
          ⚖️ Today&apos;s weight for {overdueNames} hasn&apos;t been recorded yet. Please weigh {overdueNames} now.
        </p>
      )}

      {/* ===== Header: matches the paper cage sheet ===== */}
      <div className="cattery-sheet-header">
        <div className="cattery-sheet-title">
          <h1>{catNames(booking, p.name)}</h1>
          <span className="cattery-sheet-number">{c.client_number ? `#${c.client_number}` : ''}</span>
        </div>
        <div className="cattery-sheet-meta">
          <span><strong>Date In</strong> {shortDate(booking.date_in)}</span>
          <span><strong>Date Out</strong> {shortDate(booking.date_out)}</span>
          <span><strong>Space</strong> {booking.space_number}</span>
          <span className="no-print"><strong>Status</strong> {STATUS_LABELS[booking.status]}</span>
        </div>
        <div className="cattery-sheet-meta">
          <span>
            <strong>External Treat:</strong>{' '}
            {booking.external_parasite_done ? `☑ ${booking.external_parasite_product || 'Given'}` : '☐ Not given'}
          </span>
          <span>
            <strong>Internal Treat:</strong>{' '}
            {booking.deworming_done ? `☑ ${booking.deworming_product || 'Given'}` : '☐ Not given'}
          </span>
        </div>
        <p className="cattery-sheet-owner print-only">Owner: {c.full_name}{c.phone ? ` · ${c.phone}` : ''}</p>
      </div>

      {stayWeights.some((w) => w.points.length > 0) && (
        <div className="cattery-weight-charts no-print">
          {stayWeights
            .filter((w) => w.points.length > 0)
            .map((w) => (
              <section key={w.cat.id} className="cattery-weight-chart" aria-label={`Weight during this stay${shared ? `: ${w.cat.name}` : ''}`}>
                <h3>⚖️ {shared ? `${possessive(w.cat.name)} weight` : 'Weight during this stay'}</h3>
                <WeightHistoryChart data={w.points} />
              </section>
            ))}
        </div>
      )}

      {booking.status === 'requested' && (
        <p className="cattery-notice no-print">
          ⏳ This is a client&apos;s booking request, not confirmed yet. <a href="/cattery">Review it on the Cattery planner</a> to approve or decline.
        </p>
      )}
      {booking.status === 'declined' && booking.decline_reason && (
        <p className="cattery-notes no-print">Declined: {booking.decline_reason}</p>
      )}
      {booking.owner_notes && <p className="cattery-notes no-print">💬 Owner&apos;s notes: {booking.owner_notes}</p>}

      {/* ===== Booking controls (screen only) ===== */}
      <div className="cattery-booking-controls no-print">
        {booking.status === 'booked' && <button type="button" onClick={() => patchBooking({ status: 'checked_in' })}>✅ Check in</button>}
        {booking.status === 'checked_in' && <button type="button" onClick={() => patchBooking({ status: 'checked_out' })}>🏠 Check out</button>}
        {booking.status === 'booked' && (
          <button type="button" className="secondary" onClick={() => confirm('Cancel this cattery booking?') && patchBooking({ status: 'cancelled' })}>Cancel booking</button>
        )}
        <button type="button" className="secondary" onClick={() => { setDraft({ ...booking }); setEditing((e) => !e); }}>
          {editing ? 'Close' : '✏️ Edit booking'}
        </button>
        <span className="visit-meta cattery-cats-line">
          Owner: <a href={`/clients/${c.id}`}>{c.full_name}</a> ·{' '}
          {cats.map((cat, i) => (
            <span key={cat.id}>
              <a href={`/patients/${cat.id}`}>{possessive(cat.name)} file</a>
              {i > 0 && (
                <button
                  type="button"
                  className="cattery-invoice-unlink"
                  title={`Take ${cat.name} off this booking`}
                  onClick={() => confirm(`Take ${cat.name} off this booking? Days already filled in for ${cat.name} stay saved.`) && changeCats({ remove_cat: cat.id })}
                >
                  ×
                </button>
              )}
              {i < cats.length - 1 ? ' · ' : ''}
            </span>
          ))}
          {!['cancelled', 'checked_out', 'declined', 'expired'].includes(booking.status) &&
            (householdCats === null ? (
              <button type="button" className="cattery-share-chip" title="Another cat from this household sharing the same space" onClick={loadHouseholdCats}>
                + Same space
              </button>
            ) : householdCats.length === 0 ? (
              <span>No other cats on file for this owner.</span>
            ) : (
              householdCats.map((cat) => (
                <button key={cat.id} type="button" className="cattery-share-chip" onClick={() => changeCats({ add_cat: cat.id })}>
                  + {cat.name}
                </button>
              ))
            ))}
        </span>
      </div>

      {!['requested', 'declined', 'expired'].includes(booking.status) && (() => {
        const requests = booking.consent_requests || [];
        const signed = requests.some((r) => r.status === 'submitted');
        return (
          <div className={`cattery-consent no-print ${signed ? 'signed' : 'pending'}`}>
            <span>
              📝 Cattery consent:{' '}
              {signed ? <strong>✅ Signed by the owner</strong> : requests.length ? <strong>⏳ Sent on WhatsApp, not signed yet</strong> : <strong>Not sent</strong>}
            </span>
            {!signed && (
              <button type="button" className="secondary" onClick={sendConsent} disabled={sendingConsent}>
                {sendingConsent ? 'Sending…' : requests.length ? 'Resend on WhatsApp' : 'Send on WhatsApp'}
              </button>
            )}
            {consentMessage && <span className="visit-meta">{consentMessage}</span>}
          </div>
        );
      })()}

      {editing && draft && (
        <form
          className="cattery-form no-print"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await patchBooking({
              date_in: draft.date_in,
              date_out: draft.date_out,
              space_number: draft.space_number,
              deworming_done: draft.deworming_done,
              deworming_product: draft.deworming_product,
              external_parasite_done: draft.external_parasite_done,
              external_parasite_product: draft.external_parasite_product,
              notes: draft.notes,
            });
            if (ok) setEditing(false);
          }}
        >
          <div className="cattery-form-row">
            <label>Date in<input type="date" value={draft.date_in} onChange={(e) => setDraft({ ...draft, date_in: e.target.value })} /></label>
            <label>Date out<input type="date" value={draft.date_out} onChange={(e) => setDraft({ ...draft, date_out: e.target.value })} /></label>
            <label>
              Space
              <select value={draft.space_number} onChange={(e) => setDraft({ ...draft, space_number: Number(e.target.value) })}>
                {CATTERY_SPACES.map((s) => <option key={s} value={s}>Space {s}</option>)}
              </select>
            </label>
          </div>
          <div className="cattery-form-row">
            <label className="cattery-check">
              <input type="checkbox" checked={draft.deworming_done} onChange={(e) => setDraft({ ...draft, deworming_done: e.target.checked })} />
              Deworming given
              <input type="text" value={draft.deworming_product || ''} onChange={(e) => setDraft({ ...draft, deworming_product: e.target.value })} aria-label="Deworming product" />
            </label>
            <label className="cattery-check">
              <input type="checkbox" checked={draft.external_parasite_done} onChange={(e) => setDraft({ ...draft, external_parasite_done: e.target.checked })} />
              External parasite treatment given
              <input type="text" value={draft.external_parasite_product || ''} onChange={(e) => setDraft({ ...draft, external_parasite_product: e.target.value })} aria-label="External parasite product" />
            </label>
          </div>
          <label>Notes (staff only)<textarea rows={2} value={draft.notes || ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
          <button type="submit">Save booking</button>
        </form>
      )}
      {booking.notes && !editing && <p className="cattery-notes no-print">📝 {booking.notes}</p>}
      {error && <p className="error no-print">{error}</p>}

      {/* ===== The daily sheet ===== */}
      <table className="cattery-sheet">
        <thead>
          <tr>
            <th rowSpan={2}>Date</th>
            <th rowSpan={2} />
            {shared && <th rowSpan={2}>Cat</th>}
            <th rowSpan={2}>Kg</th>
            <th colSpan={2}>Food</th>
            <th rowSpan={2}>Litter</th>
            <th rowSpan={2}>Check</th>
            <th rowSpan={2}>Comments</th>
            <th rowSpan={2} className="no-print">Owner</th>
          </tr>
          <tr><th>AM</th><th>PM</th></tr>
        </thead>
        <tbody>
          {days.flatMap((date) =>
            cats.map((cat, catIndex) => {
              const key = `${cat.id}|${date}`;
              const log = logs[key] || {};
              const isToday = date === today;
              const rowOverdue = isToday && weightOverdue(booking, Object.values(logs), undefined, cat.id);
              const saving = (field) => savingKey === `${key}:${field}`;
              const save = (field, value) => saveLog(date, field, value, cat.id);
              const label = (what) => `${what}${shared ? ` for ${cat.name}` : ''} on ${date}`;
              return [
                <tr
                  key={key}
                  className={`${isWeekend(date) ? 'weekend' : ''} ${isToday ? 'today' : ''} ${rowOverdue ? 'overdue' : ''} ${shared && catIndex > 0 ? 'cattery-cat-row' : ''}`}
                >
                  {catIndex === 0 && (
                    <>
                      <td className="cattery-date" rowSpan={cats.length}>{longDate(date)}</td>
                      <td className="cattery-day" rowSpan={cats.length}>{weekdayName(date)}</td>
                    </>
                  )}
                  {shared && <td className="cattery-cat">{cat.name}</td>}
                  <td>
                    <input
                      type="number" step="0.01" min="0" inputMode="decimal"
                      defaultValue={log.weight_kg ?? ''}
                      key={`w-${key}-${log.weight_kg ?? ''}`}
                      onBlur={(e) => e.target.value !== String(log.weight_kg ?? '') && save('weight_kg', e.target.value)}
                      className={saving('weight_kg') ? 'saving' : ''}
                      aria-label={label('Weight')}
                    />
                    <span className="print-only">{log.weight_kg ?? ''}</span>
                  </td>
                  {['food_am', 'food_pm'].map((field) => (
                    <td key={field}>
                      <select value={log[field] || ''} onChange={(e) => save(field, e.target.value)} aria-label={label(`${field === 'food_am' ? 'AM' : 'PM'} food`)}>
                        {FOOD_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <span className="print-only">{log[field] || ''}</span>
                    </td>
                  ))}
                  <td>
                    <select value={log.litter || ''} onChange={(e) => save('litter', e.target.value)} aria-label={label('Litter')}>
                      {LITTER_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <span className="print-only">{log.litter || ''}</span>
                  </td>
                  <td className="cattery-checkcell">
                    <input type="checkbox" checked={Boolean(log.checked)} onChange={(e) => save('checked', e.target.checked)} aria-label={label('Checked')} />
                    <span className="print-only">{log.checked ? '✓' : ''}</span>
                  </td>
                  <td>
                    <input
                      type="text"
                      defaultValue={log.comments || ''}
                      key={`c-${key}-${log.comments || ''}`}
                      onBlur={(e) => e.target.value !== (log.comments || '') && save('comments', e.target.value)}
                      aria-label={label('Comments')}
                    />
                    <span className="print-only">{log.comments || ''}</span>
                  </td>
                  <td className="no-print">
                    <button type="button" className={`mobile-link-btn ${log.update_for_owner ? 'cattery-has-update' : ''}`} onClick={() => {
                        const opening = openDay !== key;
                        setOpenDay(opening ? key : null);
                        // Photos attach to the day's row, so make sure it exists.
                        if (opening && !log.id) save('checked', Boolean(log.checked));
                      }}>
                      {log.update_for_owner ? '💬 Sent' : '📷 Add'}
                    </button>
                  </td>
                </tr>,
                openDay === key && (
                  <tr key={`${key}-owner`} className="cattery-owner-row no-print">
                    <td colSpan={shared ? 10 : 9}>
                      <label>
                        Update for the owner{shared ? ` about ${cat.name}` : ''} (shown on their cattery page, they get a notification)
                        <textarea
                          rows={2}
                          defaultValue={log.update_for_owner || ''}
                          key={`o-${key}-${log.update_for_owner || ''}`}
                          placeholder={`e.g. ${cat.name || p.name} ate everything this morning and is enjoying the sunny spot by the window.`}
                          onBlur={(e) => e.target.value !== (log.update_for_owner || '') && save('update_for_owner', e.target.value)}
                        />
                      </label>
                      {log.id ? (
                        <AttachmentSection entityType="cattery_log" entityId={log.id} />
                      ) : (
                        <p className="visit-meta">Getting the photo upload ready…</p>
                      )}
                    </td>
                  </tr>
                ),
              ];
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
