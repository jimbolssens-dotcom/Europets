// app/intake/page.jsx
// New-Client Intake: generate a self-service link to send a first-time
// caller over WhatsApp, then review what they submit before it becomes a
// real client + patient(s) — approving creates those records; rejecting
// just discards the submission.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { phoneSearchDigits } from '@/lib/phoneMatch';
import { CLIENT_APPOINTMENT_TYPE_LABELS } from '@/lib/appointmentBooking';

function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatApptTime(dateStr) {
  return new Date(dateStr).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function petSummary(p) {
  return [p.name, p.species, p.breed, p.microchip_number && `chip ${p.microchip_number}`]
    .filter(Boolean)
    .join(' · ');
}

export default function IntakePage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [quickPhone, setQuickPhone] = useState('+971 ');
  const [draftPhones, setDraftPhones] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const [error, setError] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [vets, setVets] = useState([]);
  const [approvalRoom, setApprovalRoom] = useState({}); // request id -> room_id chosen before approving
  const [customBooking, setCustomBooking] = useState({}); // request id -> { vetId, date, time, duration } for an 'other_surgery' request
  const [possibleMatches, setPossibleMatches] = useState({}); // intake request id -> matching clients[]

  const load = () =>
    fetch('/api/intake-requests')
      .then((res) => res.json())
      .then((data) => {
        setRequests(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    load();
    fetch('/api/rooms')
      .then((res) => res.json())
      .then((data) => setRooms(Array.isArray(data) ? data : []));
    fetch('/api/staff?role=vet')
      .then((res) => res.json())
      .then((data) => setVets(Array.isArray(data) ? data : []));
    const channel = supabase
      .channel('intake-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intake_requests' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // For every submission awaiting review, check whether its phone number or
  // name already matches an existing client — a strong sign this is the
  // same person calling in again, not a genuinely new one — so staff can
  // attach the pet(s) to that client instead of creating a duplicate.
  // Skipped for a link that already belongs to a known client (see "Send
  // Booking Link") — there's no dedup question, we already know who it is.
  useEffect(() => {
    const toCheck = requests.filter((r) => r.status === 'submitted' && !r.client_id && !(r.id in possibleMatches));
    if (toCheck.length === 0) return;

    toCheck.forEach(async (r) => {
      const digits = phoneSearchDigits(r.phone);
      const [byPhone, byName] = await Promise.all([
        digits ? fetch(`/api/clients?phone=${digits}`).then((res) => res.json()) : Promise.resolve([]),
        r.full_name ? fetch(`/api/clients?name=${encodeURIComponent(r.full_name.trim())}`).then((res) => res.json()) : Promise.resolve([]),
      ]);
      const byId = new Map();
      for (const c of [...(Array.isArray(byPhone) ? byPhone : []), ...(Array.isArray(byName) ? byName : [])]) {
        byId.set(c.id, c);
      }
      setPossibleMatches((prev) => ({ ...prev, [r.id]: [...byId.values()] }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests]);

  function portalUrl(id) {
    return `${window.location.origin}/portal/intake/${id}`;
  }

  function intakeMessage(id) {
    return `Hi! Thanks for calling Europets Clinic. Please fill in your details and your pet's details here before your visit: ${portalUrl(id)}`;
  }

  // One click does both steps: generate a fresh link (each is single-use —
  // the client fills it in once and it moves to Needs Review) and open it
  // pre-drafted in WhatsApp to the number just typed in.
  async function sendNewLink() {
    const phone = quickPhone.replace(/\D/g, '');
    if (phone.length <= 3) {
      setError('Enter a phone number first');
      return;
    }
    setSending(true);
    setError(null);
    const res = await fetch('/api/intake-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sent_to_phone: `+${phone}` }),
    });
    if (!res.ok) {
      setSending(false);
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to generate an intake link');
      return;
    }
    const data = await res.json();
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(intakeMessage(data.id))}`, '_blank');
    setQuickPhone('+971 ');
    setSending(false);
    load();
  }

  async function copyLink(id) {
    await navigator.clipboard.writeText(portalUrl(id));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // Reflects whatever's currently in that row's editable "Sent To" field —
  // if it was changed since the link was sent, save it first so the list
  // keeps showing who's actually being waited on.
  async function shareViaWhatsApp(r) {
    const raw = draftPhones[r.id] ?? r.sent_to_phone ?? '+971 ';
    const phone = raw.replace(/\D/g, '');
    if (phone.length <= 3) return;
    const normalized = `+${phone}`;
    if (normalized !== r.sent_to_phone) {
      await fetch(`/api/intake-requests/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_phone', sent_to_phone: normalized }),
      });
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(intakeMessage(r.id))}`, '_blank');
    load();
  }

  async function cancelLink(id) {
    if (!confirm('Cancel this unused intake link?')) return;
    await fetch(`/api/intake-requests/${id}`, { method: 'DELETE' });
    load();
  }

  async function review(id, action, clientId, request) {
    if (action === 'approve' && clientId) {
      const match = (possibleMatches[id] || []).find((c) => c.id === clientId);
      if (!confirm(`Attach this submission's pet(s) to the existing client "${match?.full_name}" instead of creating a new one?`)) {
        return;
      }
    }
    const isCustomSurgery = request?.appointment_type === 'other_surgery';
    const custom = customBooking[id] || {};
    if (action === 'approve' && request?.appointment_type) {
      if (!approvalRoom[id]) {
        setError('Pick a room for the requested appointment before approving');
        return;
      }
      if (isCustomSurgery && (!custom.vetId || !custom.date || !custom.time || !custom.duration)) {
        setError('Pick a vet, date, time, and duration for this custom surgery request before approving');
        return;
      }
    }
    setError(null);
    const res = await fetch(`/api/intake-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        ...(clientId ? { client_id: clientId } : {}),
        ...(action === 'approve' && request?.appointment_type ? { room_id: approvalRoom[id] } : {}),
        ...(action === 'approve' && isCustomSurgery
          ? {
              vet_id: custom.vetId,
              start_time: new Date(`${custom.date}T${custom.time}:00`).toISOString(),
              duration_minutes: Number(custom.duration),
            }
          : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || `Failed to ${action} this request`);
      return;
    }
    load();
  }

  if (loading) return <p>Loading intake requests...</p>;

  const pending = requests.filter((r) => r.status === 'pending');
  const submitted = requests.filter((r) => r.status === 'submitted');
  const approved = requests.filter((r) => r.status === 'approved').slice(0, 10);

  return (
    <div>
      <h1>New-Client Intake</h1>
      <p className="visit-meta">
        Enter a first-time caller&apos;s number and send them a link to fill in their own and their
        pet&apos;s details before they come in — a fresh link is created and drafted in WhatsApp in one
        step. Submissions land here for review — approving creates the client and patient records.
      </p>

      {error && <p className="error">{error}</p>}

      <div className="intake-quick-send">
        <input
          type="tel"
          placeholder="Phone number"
          value={quickPhone}
          onChange={(e) => setQuickPhone(e.target.value)}
        />
        <button type="button" onClick={sendNewLink} disabled={sending}>
          {sending ? 'Sending...' : '💬 Send Intake Link via WhatsApp'}
        </button>
      </div>

      {pending.length > 0 && (
        <>
          <h2>Sent, Awaiting Submission</h2>
          <table>
            <thead>
              <tr>
                <th>Link</th>
                <th>Sent To</th>
                <th>Sent</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id}>
                  <td>
                    <button type="button" onClick={() => copyLink(r.id)}>
                      {copiedId === r.id ? 'Copied!' : '🔗 Copy Link'}
                    </button>
                  </td>
                  <td>
                    <input
                      type="tel"
                      placeholder="Phone number"
                      value={draftPhones[r.id] ?? r.sent_to_phone ?? '+971 '}
                      onChange={(e) => setDraftPhones({ ...draftPhones, [r.id]: e.target.value })}
                    />
                    <button type="button" onClick={() => shareViaWhatsApp(r)}>
                      💬 WhatsApp
                    </button>
                  </td>
                  <td>{formatDateTime(r.created_at)}</td>
                  <td>
                    <button type="button" onClick={() => cancelLink(r.id)}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {submitted.length > 0 && (
        <>
          <h2>Needs Review</h2>
          {submitted.map((r) => (
            <div key={r.id} className="intake-review-card">
              {r.client_id ? (
                <p>
                  <strong>{r.clients?.full_name}</strong> <span className="visit-meta">(existing client)</span>
                </p>
              ) : (
                <p>
                  <strong>{r.full_name}</strong> · {r.phone}
                  {r.email && ` · ${r.email}`}
                </p>
              )}
              {r.address && <p className="visit-meta">{r.address}</p>}
              {r.emirates_id && <p className="visit-meta">Emirates ID: {r.emirates_id}</p>}
              <ul>
                {r.selected_patient && (
                  <li>{[r.selected_patient.name, r.selected_patient.species, r.selected_patient.breed].filter(Boolean).join(' · ')} (existing pet)</li>
                )}
                {(r.patients || []).map((p, i) => (
                  <li key={i}>{petSummary(p)}</li>
                ))}
              </ul>
              {r.notes && <p className="visit-meta">Notes: {r.notes}</p>}
              <p className="visit-meta">Submitted {formatDateTime(r.submitted_at)}</p>

              {r.appointment_type === 'other_surgery' && (
                <div className="intake-appointment-request">
                  <p>
                    📅 Requested: <strong>Custom surgery/procedure</strong>
                    {r.preferred_date && ` — preferred day: ${new Date(`${r.preferred_date}T00:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}`}
                  </p>
                  <p className="visit-meta">&quot;{r.custom_surgery_reason}&quot;</p>
                  <p className="visit-meta">Pick a vet, date, time, and duration, and a room, to schedule this:</p>
                  <label>
                    Vet
                    <select
                      value={customBooking[r.id]?.vetId || ''}
                      onChange={(e) => setCustomBooking({ ...customBooking, [r.id]: { ...customBooking[r.id], vetId: e.target.value } })}
                    >
                      <option value="">Select vet...</option>
                      {vets.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Date (surgeries are morning-only)
                    <input
                      type="date"
                      value={customBooking[r.id]?.date || r.preferred_date || ''}
                      onChange={(e) => setCustomBooking({ ...customBooking, [r.id]: { ...customBooking[r.id], date: e.target.value } })}
                    />
                  </label>
                  <label>
                    Time
                    <input
                      type="time"
                      value={customBooking[r.id]?.time || ''}
                      onChange={(e) => setCustomBooking({ ...customBooking, [r.id]: { ...customBooking[r.id], time: e.target.value } })}
                    />
                  </label>
                  <label>
                    Duration (minutes)
                    <input
                      type="number"
                      min="10"
                      step="5"
                      value={customBooking[r.id]?.duration || ''}
                      onChange={(e) => setCustomBooking({ ...customBooking, [r.id]: { ...customBooking[r.id], duration: e.target.value } })}
                    />
                  </label>
                  <label>
                    Room (required to approve)
                    <select
                      value={approvalRoom[r.id] || ''}
                      onChange={(e) => setApprovalRoom({ ...approvalRoom, [r.id]: e.target.value })}
                    >
                      <option value="">Select room...</option>
                      {rooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {r.appointment_type && r.appointment_type !== 'other_surgery' && (
                <div className="intake-appointment-request">
                  <p>
                    📅 Requested: <strong>{CLIENT_APPOINTMENT_TYPE_LABELS[r.appointment_type]}</strong> with{' '}
                    {r.requested_vet?.full_name || 'any available vet'} — {formatApptTime(r.requested_start_time)} (
                    {r.requested_duration_minutes} min)
                  </p>
                  <label>
                    Room (required to approve)
                    <select
                      value={approvalRoom[r.id] || ''}
                      onChange={(e) => setApprovalRoom({ ...approvalRoom, [r.id]: e.target.value })}
                    >
                      <option value="">Select room...</option>
                      {rooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {possibleMatches[r.id]?.length > 0 && (
                <div className="possible-duplicate-warning">
                  <p>
                    ⚠️ Possibly already a client — matched by phone or name:
                  </p>
                  <ul>
                    {possibleMatches[r.id].map((c) => (
                      <li key={c.id}>
                        <a href={`/clients/${c.id}`} target="_blank" rel="noreferrer">
                          {c.full_name}
                        </a>{' '}
                        · {c.phone || 'no phone on file'}
                        {c.email && ` · ${c.email}`}
                        <button type="button" onClick={() => review(r.id, 'approve', c.id, r)}>
                          Attach pet(s) to this client
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="intake-review-actions">
                <button
                  type="button"
                  onClick={() => review(r.id, 'approve', null, r)}
                  disabled={
                    Boolean(r.appointment_type) &&
                    (!approvalRoom[r.id] ||
                      (r.appointment_type === 'other_surgery' &&
                        (!customBooking[r.id]?.vetId || !customBooking[r.id]?.date || !customBooking[r.id]?.time || !customBooking[r.id]?.duration)))
                  }
                >
                  {possibleMatches[r.id]?.length > 0 ? 'Create as New Client Anyway' : 'Approve'}
                </button>
                <button type="button" className="secondary" onClick={() => review(r.id, 'reject', null, r)}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {approved.length > 0 && (
        <>
          <h2>Recently Approved</h2>
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Approved</th>
              </tr>
            </thead>
            <tbody>
              {approved.map((r) => (
                <tr key={r.id}>
                  <td>
                    <a href={`/clients/${r.clients?.id}`}>{r.clients?.full_name}</a>
                  </td>
                  <td>{formatDateTime(r.reviewed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {pending.length === 0 && submitted.length === 0 && approved.length === 0 && (
        <p className="visit-meta">No intake links yet — send one above.</p>
      )}
    </div>
  );
}
