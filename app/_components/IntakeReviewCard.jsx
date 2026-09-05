// app/_components/IntakeReviewCard.jsx
// One submitted intake_requests row awaiting staff approve/reject —
// shared by the Invite page (plain new-client/add-pet submissions) and
// the Appointment Requests panel on the Appointments page (submissions
// that also asked for a slot). `compact` tightens the layout for the
// narrow column beside the schedule.

'use client';

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

export default function IntakeReviewCard({
  r,
  rooms,
  vets,
  approvalRoom,
  setApprovalRoom,
  customBooking,
  setCustomBooking,
  possibleMatches,
  reviewing,
  reviewErrors,
  review,
  compact,
}) {
  const matches = possibleMatches?.[r.id] || [];

  return (
    <div className={compact ? 'intake-review-card intake-review-card-compact' : 'intake-review-card'}>
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
      {!compact && r.address && <p className="visit-meta">{r.address}</p>}
      {!compact && r.emirates_id && <p className="visit-meta">Emirates ID: {r.emirates_id}</p>}
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

      {matches.length > 0 && (
        <div className="possible-duplicate-warning">
          <p>⚠️ Possibly already a client — matched by phone or name:</p>
          <ul>
            {matches.map((c) => (
              <li key={c.id}>
                <a href={`/clients/${c.id}`} target="_blank" rel="noreferrer">
                  {c.full_name}
                </a>{' '}
                · {c.phone || 'no phone on file'}
                {c.email && ` · ${c.email}`}
                <button
                  type="button"
                  onClick={() => review(r.id, 'approve', c.id, r, c.full_name)}
                  disabled={reviewing?.id === r.id}
                >
                  {reviewing?.id === r.id ? 'Working...' : 'Attach pet(s) to this client'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {reviewErrors[r.id] && <p className="error">{reviewErrors[r.id]}</p>}

      <div className="intake-review-actions">
        <button
          type="button"
          onClick={() => review(r.id, 'approve', null, r)}
          disabled={
            reviewing?.id === r.id ||
            (Boolean(r.appointment_type) &&
              (!approvalRoom[r.id] ||
                (r.appointment_type === 'other_surgery' &&
                  (!customBooking[r.id]?.vetId || !customBooking[r.id]?.date || !customBooking[r.id]?.time || !customBooking[r.id]?.duration))))
          }
        >
          {reviewing?.id === r.id && reviewing.action === 'approve'
            ? 'Approving...'
            : matches.length > 0
              ? 'Create as New Client Anyway'
              : 'Approve'}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => review(r.id, 'reject', null, r)}
          disabled={reviewing?.id === r.id}
        >
          {reviewing?.id === r.id && reviewing.action === 'reject' ? 'Rejecting...' : 'Reject'}
        </button>
      </div>
    </div>
  );
}
