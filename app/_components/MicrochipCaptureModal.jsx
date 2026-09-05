// app/_components/MicrochipCaptureModal.jsx
// Popped up whenever a "Microchip" product is added to a consult's
// treatment plan or directly to an invoice — captures the chip number so
// it (and today's date, as the implantation date) can be saved straight to
// the patient file, instead of relying on someone to do that separately.

'use client';

import { useState } from 'react';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function MicrochipCaptureModal({ patientName, confirmLabel = 'Save & Continue', onCancel, onConfirm }) {
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(today());
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm(e) {
    e.preventDefault();
    if (!number.trim()) {
      setError('Microchip number is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    const failure = await onConfirm(number.trim(), date);
    setSubmitting(false);
    if (failure) setError(failure);
  }

  return (
    <div className="modal-backdrop" onClick={submitting ? undefined : onCancel}>
      <form className="modal-panel microchip-modal-panel" onClick={(e) => e.stopPropagation()} onSubmit={handleConfirm}>
        <h3>Microchip Implanted{patientName ? ` — ${patientName}` : ''}</h3>
        <p className="visit-meta">
          This will be saved to the patient file as the microchip number and implantation date.
        </p>
        {error && <p className="error">{error}</p>}
        <label>
          Microchip number
          <input
            autoFocus
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="15-digit ISO number"
          />
        </label>
        <label>
          Implantation date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
