// app/_components/PatientTransfer.jsx
// "Transfer owner" on the patient page (migration 181): pick the new
// owner, see what moves and what stays, choose what happens to the pet's
// unpaid bills, confirm. Same patient, same patient number; the history
// moves with it. Also shows the "Previous owner" line from earlier
// transfers.

'use client';

import { useEffect, useState } from 'react';
import SingleTypeSearch from '@/app/_components/SingleTypeSearch';

function dayMonthYear(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function PreviousOwners({ patientId, refreshKey }) {
  const [transfers, setTransfers] = useState([]);
  useEffect(() => {
    fetch(`/api/patients/${patientId}/transfer`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setTransfers(Array.isArray(data) ? data : []))
      .catch(() => setTransfers([]));
  }, [patientId, refreshKey]);
  if (transfers.length === 0) return null;
  return (
    <p className="patient-previous-owners">
      {transfers.map((t, i) => (
        <span key={t.id}>
          {i > 0 && ' · '}
          Previous owner{' '}
          {t.from ? (
            <a href={`/clients/${t.from.id}`}>
              {t.from.full_name} #{t.from.client_number}
            </a>
          ) : (
            'unknown'
          )}{' '}
          until {dayMonthYear(t.created_at)}
          {t.staff?.full_name ? ` (by ${t.staff.full_name})` : ''}
        </span>
      ))}
    </p>
  );
}

// `open` / `onOpenChange` (optional) let the page open the transfer box
// from elsewhere (the patient page's More menu); without them it shows its
// own "Transfer owner" button as before.
export default function PatientTransfer({ patient, staff = [], onTransferred, open: openProp, onOpenChange }) {
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;
  const setOpen = (value) => (controlled ? onOpenChange?.(value) : setOpenState(value));
  const [newOwner, setNewOwner] = useState(null);
  const [preview, setPreview] = useState(null);
  const [billsGoTo, setBillsGoTo] = useState('old'); // 'old' | 'new'
  const [staffId, setStaffId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setPreview(null);
    setError(null);
    if (!newOwner) return;
    fetch(`/api/patients/${patient.id}/transfer?to=${newOwner.id}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => (ok ? setPreview(data) : setError(data.error || 'Could not load the preview')));
  }, [newOwner, patient.id]);

  async function confirmTransfer() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/patients/${patient.id}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_client_id: newOwner.id, move_unpaid_invoices: billsGoTo === 'new', staff_id: staffId || null }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'The transfer failed; nothing was changed.');
      return;
    }
    setOpen(false);
    setNewOwner(null);
    if (onTransferred) onTransferred(data);
  }

  if (!open) {
    if (controlled) return null;
    return (
      <button type="button" className="button-link" onClick={() => setOpen(true)} title="Move this patient, with its history, to another owner">
        🔁 Transfer owner
      </button>
    );
  }

  const hasUnpaid = preview && preview.unpaidInvoices.length > 0;
  return (
    <div className="patient-transfer-box">
      <div className="patient-transfer-head">
        <strong>
          Transfer {patient.name} #{patient.patient_number} to another owner
        </strong>
        <button type="button" className="patient-transfer-close" onClick={() => setOpen(false)} aria-label="Close">
          ×
        </button>
      </div>

      {!newOwner ? (
        <SingleTypeSearch type="client" placeholder="Search the new owner (name, phone, client number)…" onPick={setNewOwner} />
      ) : (
        <>
          <p className="patient-transfer-route">
            <span>{preview?.from ? `${preview.from.full_name} #${preview.from.client_number}` : '…'}</span>
            <span aria-hidden="true">→</span>
            <span>
              <strong>{newOwner.full_name}</strong>
              {preview?.to?.client_number ? ` #${preview.to.client_number}` : ''}
            </span>
            <button type="button" className="patient-transfer-change" onClick={() => setNewOwner(null)}>
              change
            </button>
          </p>

          {preview?.sameOwner && <p className="error">{patient.name} already belongs to this owner.</p>}

          {preview && !preview.sameOwner && (
            <>
              <div className="patient-transfer-cols">
                <div>
                  <h4>Moves with {patient.name}</h4>
                  <ul>
                    <li>Same patient number #{preview.patient.patient_number}</li>
                    <li>
                      {preview.moves.consults} consult{preview.moves.consults === 1 ? '' : 's'}, {preview.moves.stays} stay
                      {preview.moves.stays === 1 ? '' : 's'} / day procedure{preview.moves.stays === 1 ? '' : 's'}
                    </li>
                    <li>
                      {preview.moves.appointments} appointment{preview.moves.appointments === 1 ? '' : 's'}, {preview.moves.vaccinations} vaccination
                      {preview.moves.vaccinations === 1 ? '' : 's'}
                    </li>
                    <li>Alerts, weights, photos, reports, consent forms</li>
                    <li>Future reminders go to the new owner</li>
                  </ul>
                </div>
                <div>
                  <h4>Stays with {preview.from?.full_name || 'the old owner'}</h4>
                  <ul>
                    <li>
                      {preview.paidInvoices} paid invoice{preview.paidInvoices === 1 ? '' : 's'}
                    </li>
                    <li>Messages, old-system balance and payments</li>
                  </ul>
                </div>
              </div>

              {hasUnpaid && (
                <fieldset className="patient-transfer-bills">
                  <legend>
                    Unpaid bills for {patient.name}: {preview.unpaidInvoices.map((i) => `${i.label} (${i.due})`).join(', ')}
                  </legend>
                  <label>
                    <input type="radio" name="bills" checked={billsGoTo === 'old'} onChange={() => setBillsGoTo('old')} /> Keep with{' '}
                    {preview.from?.full_name}
                  </label>
                  <label>
                    <input type="radio" name="bills" checked={billsGoTo === 'new'} onChange={() => setBillsGoTo('new')} /> Move to{' '}
                    {newOwner.full_name} ({preview.unpaidTotal})
                  </label>
                </fieldset>
              )}

              <div className="patient-transfer-confirm">
                <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                  <option value="">Done by…</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={confirmTransfer} disabled={busy}>
                  {busy ? 'Transferring…' : `Transfer to ${newOwner.full_name}`}
                </button>
              </div>
            </>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
