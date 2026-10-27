'use client';

// app/_components/HealthCertificatePanel.jsx
// The export health certificate (migration 231) from the patient page:
// the owner, animal, microchip and vaccines come from the records (checked
// as you type, with what's missing flagged), staff add the parasite
// treatments and the trip, and Issue numbers it, saves it as printed and
// opens the PDF (lib/healthCertificatePdf.js). Earlier ones reprint from
// the list.

import { useEffect, useState } from 'react';

function todayUae() {
  return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const day = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export default function HealthCertificatePanel({ patientId, staff, onClose }) {
  const vets = (staff || []).filter((s) => s.role === 'vet' && s.active !== false);
  const [form, setForm] = useState({
    exam_date: todayUae(),
    vet_id: '',
    destination: '',
    travel_date: '',
    microchip_location: 'Left side of the neck',
    internal_product: '',
    internal_date: '',
    external_product: '',
    external_date: '',
    visited: 'None (resident in the United Arab Emirates)',
    remarks: '',
  });
  const [preview, setPreview] = useState(null);
  const [issued, setIssued] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (!form.vet_id && vets[0]) setForm((f) => ({ ...f, vet_id: vets[0].id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vets.length]);

  const loadIssued = () =>
    fetch(`/api/patients/${patientId}/health-certificates`)
      .then((r) => r.json())
      .then((d) => setIssued(Array.isArray(d) ? d : []))
      .catch(() => {});
  useEffect(() => {
    loadIssued();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  // What it would say, re-checked a moment after each change.
  useEffect(() => {
    if (!form.vet_id) return undefined;
    const t = setTimeout(() => {
      fetch(`/api/patients/${patientId}/health-certificates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, preview: true }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (!d.data) return;
          setPreview(d.data);
          // The owner's address from their file, once, then editable.
          setForm((f) => (f.owner_address === undefined ? { ...f, owner_address: d.data.owner.address || '' } : f));
        })
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [form, patientId]);

  async function issue() {
    setBusy(true);
    setError(null);
    let staffId = '';
    try {
      staffId = localStorage.getItem('team_staff_id') || localStorage.getItem('europets_mobile_staff_id') || '';
    } catch {}
    const res = await fetch(`/api/patients/${patientId}/health-certificates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, staff_id: staffId || undefined }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(d.error || 'Could not issue the certificate');
    window.open(`/api/health-certificates/${d.id}/pdf`, '_blank');
    loadIssued();
  }

  const rabies = preview?.vaccines?.find((v) => v.kind === 'rabies');
  const others = (preview?.vaccines || []).filter((v) => v.kind !== 'rabies');

  return (
    <div className="card health-cert">
      <div className="page-header">
        <h3>📄 Health certificate</h3>
        <div className="page-header-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {preview && (
        <div className="health-cert-facts">
          <span>
            Chip <b>{preview.microchip.number || 'none'}</b>
            {preview.microchip.number ? (preview.microchip.iso ? ' · ISO' : ' · not ISO') : ''}
          </span>
          <span>
            Rabies <b>{rabies ? `${day(rabies.date_given)} → ${day(rabies.valid_until) || '?'}` : 'none'}</b>
          </span>
          {others.length > 0 && <span>Also {others.map((v) => v.disease).join(', ')}</span>}
        </div>
      )}
      {preview?.warnings?.length > 0 && (
        <ul className="health-cert-warnings">
          {preview.warnings.map((w) => (
            <li key={w}>⚠️ {w}</li>
          ))}
        </ul>
      )}

      <div className="health-cert-form">
        <label>
          Examined
          <input type="date" max={todayUae()} value={form.exam_date} onChange={set('exam_date')} />
        </label>
        <label>
          Signed by
          <select value={form.vet_id} onChange={set('vet_id')}>
            {vets.map((v) => (
              <option key={v.id} value={v.id}>
                {v.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Destination
          <input placeholder="Country" value={form.destination} onChange={set('destination')} />
        </label>
        <label>
          Travel date
          <input type="date" value={form.travel_date} onChange={set('travel_date')} />
        </label>
        <label className="health-cert-wide">
          Owner&apos;s address
          <input value={form.owner_address ?? ''} onChange={set('owner_address')} />
        </label>
        <label>
          Worming (product)
          <input placeholder="e.g. Milbemax" value={form.internal_product} onChange={set('internal_product')} />
        </label>
        <label>
          Date
          <input type="date" value={form.internal_date} onChange={set('internal_date')} />
        </label>
        <label>
          Flea/tick (product)
          <input placeholder="e.g. Bravecto" value={form.external_product} onChange={set('external_product')} />
        </label>
        <label>
          Date
          <input type="date" value={form.external_date} onChange={set('external_date')} />
        </label>
        <label className="health-cert-wide">
          Countries visited in the last 6 months
          <input value={form.visited} onChange={set('visited')} />
        </label>
        <label>
          Microchip location
          <input value={form.microchip_location} onChange={set('microchip_location')} />
        </label>
        <label>
          Remarks
          <input placeholder="Optional" value={form.remarks} onChange={set('remarks')} />
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      <div className="health-cert-actions">
        <button type="button" onClick={issue} disabled={busy || !form.vet_id}>
          {busy ? 'Issuing...' : 'Issue certificate (PDF)'}
        </button>
        <span className="visit-meta">Print it, sign it and stamp it. It&apos;s numbered and kept below.</span>
      </div>

      {issued.length > 0 && (
        <ul className="health-cert-issued">
          {issued.map((c) => (
            <li key={c.id}>
              <a href={`/api/health-certificates/${c.id}/pdf`} target="_blank" rel="noreferrer">
                {c.certificate_number}
              </a>{' '}
              · {day(c.exam_date)}
              {c.destination ? ` · ${c.destination}` : ''}
              {c.staff?.full_name ? ` · ${c.staff.full_name}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
