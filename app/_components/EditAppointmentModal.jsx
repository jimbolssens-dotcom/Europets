// app/_components/EditAppointmentModal.jsx
// Edit an existing appointment's patient, room, vet, type/duration, date/
// time, or reason — everything the schedule's drag-to-move/resize can't
// reach (those stay as drag gestures on the grid itself; this covers the
// rest, including moving an appointment to a different day entirely).
// Opened by a plain click on a schedule block (a double-click still opens
// the consult, unchanged).

'use client';

import { useEffect, useState } from 'react';
import SearchSelect from './SearchSelect';
import ClientOrPatientSearch from './ClientOrPatientSearch';

function toISODateLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toHHMMLocal(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function EditAppointmentModal({ appointment, rooms, vets, onClose, onSave }) {
  const startDate = new Date(appointment.start_time);

  const [ownerId, setOwnerId] = useState(appointment.client_id);
  const [ownerName, setOwnerName] = useState(appointment.clients?.full_name || '');
  const [changingOwner, setChangingOwner] = useState(false);
  const [clientPatients, setClientPatients] = useState([]);
  const [patientId, setPatientId] = useState(appointment.patient_id);
  const [roomId, setRoomId] = useState(appointment.room_id || '');
  const [vetId, setVetId] = useState(appointment.vet_id || '');
  const [type, setType] = useState(appointment.type);
  const [duration, setDuration] = useState(String(appointment.duration_minutes));
  const [dateStr, setDateStr] = useState(toISODateLocal(startDate));
  const [timeStr, setTimeStr] = useState(toHHMMLocal(startDate));
  const [reason, setReason] = useState(appointment.reason || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ownerId) {
      setClientPatients([]);
      return;
    }
    fetch(`/api/patients?client_id=${ownerId}`)
      .then((res) => res.json())
      .then((data) => setClientPatients(Array.isArray(data) ? data : []));
  }, [ownerId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!patientId || !roomId) {
      setError('Select a patient and room');
      return;
    }
    setSubmitting(true);
    setError(null);

    const startTime = new Date(`${dateStr}T${timeStr}:00`);
    const shift = startTime.getHours() < 12 ? 'morning' : 'afternoon';

    const result = await onSave({
      patient_id: patientId,
      room_id: roomId,
      vet_id: vetId || null,
      type,
      duration_minutes: type === 'surgery' ? Number(duration) : undefined,
      reason,
      start_time: startTime.toISOString(),
      date: dateStr,
      shift,
    });

    setSubmitting(false);
    if (result?.error) setError(result.error);
  }

  // A no-show and a cancellation are both just a status change — kept
  // here alongside the rest of the edit so staff have one place to log
  // either, instead of hunting for a separate action elsewhere.
  async function handleStatusChange(status) {
    setSubmitting(true);
    setError(null);
    const result = await onSave({ status });
    setSubmitting(false);
    if (result?.error) setError(result.error);
  }

  return (
    <div className="modal-backdrop" onClick={submitting ? undefined : onClose}>
      <form className="modal-panel edit-appointment-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>Edit Appointment</h3>
        {error && <p className="error">{error}</p>}

        {changingOwner ? (
          <ClientOrPatientSearch
            placeholder="Search clients or patients..."
            onPickClient={(c) => {
              setOwnerId(c.id);
              setOwnerName(c.full_name);
              setPatientId('');
              setChangingOwner(false);
            }}
            onPickPatient={(p) => {
              setOwnerId(p.client_id);
              setOwnerName(p.clients?.full_name || '');
              setPatientId(p.id);
              setChangingOwner(false);
            }}
          />
        ) : (
          <p className="booking-owner-picked">
            Owner: <strong>{ownerName}</strong>{' '}
            <button type="button" onClick={() => setChangingOwner(true)}>
              Change
            </button>
          </p>
        )}

        <SearchSelect
          items={clientPatients}
          value={patientId}
          onChange={(id) => setPatientId(id)}
          getLabel={(p) => p.name}
          getSubLabel={(p) => p.species}
          placeholder="Select patient..."
          disabled={!ownerId}
        />

        <label>
          Room
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)} required>
            <option value="">Select room...</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Vet
          <select value={vetId} onChange={(e) => setVetId(e.target.value)}>
            <option value="">Unassigned</option>
            {vets.map((v) => (
              <option key={v.id} value={v.id}>
                {v.full_name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="consult">Consult (15 min)</option>
            <option value="surgery">Surgery (10-min increments)</option>
          </select>
        </label>

        {type === 'surgery' && (
          <label>
            Duration (minutes)
            <input
              type="number"
              min="10"
              step="10"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </label>
        )}

        <label>
          Date
          <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} required />
        </label>

        <label>
          Time
          <input type="time" value={timeStr} onChange={(e) => setTimeStr(e.target.value)} required />
        </label>

        <label>
          Reason
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for visit (optional)"
          />
        </label>

        <div className="modal-actions modal-actions-status">
          <button type="button" className="secondary" onClick={() => handleStatusChange('no_show')} disabled={submitting}>
            🚫 Mark No-Show
          </button>
          <button type="button" className="secondary" onClick={() => handleStatusChange('cancelled')} disabled={submitting}>
            ✖️ Cancel Appointment
          </button>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={submitting}>
            Close
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
