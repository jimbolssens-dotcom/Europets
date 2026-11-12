// app/_components/PrescriptionPanel.jsx
// 💊 Prescription for an outside pharmacy (Jim, 12 Nov), opened from the
// patient file's More menu. Pick the prescribing vet, add each medicine
// (name, strength, how much to supply, how to give it, for how long), save,
// then open the PDF or send it to the owner from the clinic WhatsApp or by
// email. Earlier prescriptions are listed underneath to open or resend.
// API: app/api/patients/[id]/prescriptions; PDF: lib/prescriptionPdf.js.

'use client';

import { useEffect, useState } from 'react';
import { appOrigin } from '@/lib/appOrigin';
import { rxNumber } from '@/lib/prescriptions';

const EMPTY = { name: '', strength: '', quantity: '', directions: '', duration: '' };

function shortDate(ts) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' });
}

export default function PrescriptionPanel({ patient, staff = [], onClose }) {
  const [catalog, setCatalog] = useState([]);
  const vets = staff.filter((s) => s.role === 'vet' && s.active !== false);
  const [vetId, setVetId] = useState(() => {
    try {
      return localStorage.getItem('rx_vet_id') || '';
    } catch {
      return '';
    }
  });
  const [items, setItems] = useState([{ ...EMPTY }]);
  const [notes, setNotes] = useState('');
  const [list, setList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState({}); // id -> message after sending
  const [justSaved, setJustSaved] = useState(null);

  const load = () =>
    fetch(`/api/patients/${patient.id}/prescriptions`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => Array.isArray(d) && setList(d))
      .catch(() => {});

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id]);

  // The catalog's medicines, as suggestions while typing a name.
  useEffect(() => {
    fetch('/api/goods-services')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => Array.isArray(d) && setCatalog(d))
      .catch(() => {});
  }, []);

  const medNames = catalog
    .filter((g) => g.main_category === 'product' && g.active !== false)
    .map((g) => g.name.replace(/[\^*]+/g, '').trim());

  const setItem = (i, patch) => setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  async function save() {
    setError(null);
    if (!vetId) return setError('Choose the prescribing vet');
    setSaving(true);
    try {
      const res = await fetch(`/api/patients/${patient.id}/prescriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vet_id: vetId, items, notes }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Could not save the prescription');
      try {
        localStorage.setItem('rx_vet_id', vetId);
      } catch {}
      setItems([{ ...EMPTY }]);
      setNotes('');
      setJustSaved(out.id);
      setList((prev) => [out, ...prev]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const pdfUrl = (id) => `${appOrigin()}/api/prescriptions/${id}/pdf`;

  async function sendWhatsApp(rx) {
    const client = patient.clients;
    setStatus((s) => ({ ...s, [rx.id]: 'Sending…' }));
    if (!client?.id || (client.phone || '').replace(/\D/g, '').length <= 3) {
      setStatus((s) => ({ ...s, [rx.id]: 'No phone number on file for this client.' }));
      return;
    }
    const res = await fetch(`/api/clients/${client.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: `Here is ${patient.name}'s prescription from Europets Clinic (${rxNumber(rx.rx_number)}), to show at the pharmacy: ${pdfUrl(rx.id)}`,
        staff_id: rx.vet_id,
        channel: 'whatsapp',
      }),
    });
    const data = await res.json().catch(() => ({}));
    setStatus((s) => ({ ...s, [rx.id]: res.ok ? '✅ Sent from the clinic WhatsApp' : data.error || 'Could not send it' }));
  }

  async function sendEmail(rx) {
    const client = patient.clients;
    if (!client?.email) {
      setStatus((s) => ({ ...s, [rx.id]: 'No email address on file for this client.' }));
      return;
    }
    setStatus((s) => ({ ...s, [rx.id]: 'Sending…' }));
    const res = await fetch(`/api/clients/${client.id}/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: `${patient.name}'s prescription: ${rxNumber(rx.rx_number)}`,
        text: `Hi ${client.full_name || ''},\n\nHere is ${patient.name}'s prescription from Europets Clinic, to show at the pharmacy:\n${pdfUrl(rx.id)}\n\nPlease don't hesitate to reach out if you have any questions.`,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setStatus((s) => ({ ...s, [rx.id]: res.ok ? '✅ Emailed' : data.error || 'Could not send it' }));
  }

  return (
    <div className="card rx-panel">
      <div className="page-header">
        <h2>💊 Prescription</h2>
        <div className="page-header-actions">
          <button type="button" className="secondary" onClick={onClose}>Close</button>
        </div>
      </div>
      <p className="visit-meta">For {patient.name}, to buy at an outside pharmacy. Saved, numbered and listed below.</p>

      <label className="rx-vet">
        Prescribing vet
        <select value={vetId} onChange={(e) => setVetId(e.target.value)}>
          <option value="">Choose…</option>
          {vets.map((v) => (
            <option key={v.id} value={v.id}>{v.full_name}</option>
          ))}
        </select>
      </label>

      <datalist id="rx-med-names">
        {medNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {items.map((it, i) => (
        <div className="rx-item" key={i}>
          <span className="rx-num">{i + 1}.</span>
          <div className="rx-fields">
            <input className="rx-name" list="rx-med-names" placeholder="Medicine (e.g. Augmentin 625mg tablets)" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} />
            <div className="rx-row">
              <input placeholder="Strength (e.g. 625 mg)" value={it.strength} onChange={(e) => setItem(i, { strength: e.target.value })} />
              <input placeholder="Supply (e.g. 28 tablets)" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} />
              <input placeholder="Duration (e.g. 14 days)" value={it.duration} onChange={(e) => setItem(i, { duration: e.target.value })} />
            </div>
            <textarea rows={2} placeholder="How to give it (e.g. ½ tablet by mouth twice daily with food)" value={it.directions} onChange={(e) => setItem(i, { directions: e.target.value })} />
          </div>
          {items.length > 1 && (
            <button type="button" className="rx-x" onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove this medicine">×</button>
          )}
        </div>
      ))}
      <button type="button" className="hc-link" onClick={() => setItems((prev) => [...prev, { ...EMPTY }])}>+ Another medicine</button>
      <label className="rx-notes">
        Notes (optional)
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Generic equivalent acceptable" />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="rx-actions">
        <button type="button" onClick={save} disabled={saving}>{saving ? 'Saving…' : '✓ Save prescription'}</button>
      </div>

      {list.length > 0 && (
        <ul className="rx-list">
          {list.map((rx) => (
            <li key={rx.id} className={justSaved === rx.id ? 'rx-new' : ''}>
              <div className="rx-list-head">
                <b>{rxNumber(rx.rx_number)}</b>
                <span className="visit-meta">{shortDate(rx.created_at)}{rx.staff?.full_name ? ` · ${rx.staff.full_name}` : ''}</span>
              </div>
              <div className="visit-meta">{(rx.items || []).map((x) => x.name).join(', ')}</div>
              <div className="rx-send">
                <a className="button-link" href={`/api/prescriptions/${rx.id}/pdf`} target="_blank" rel="noreferrer">📄 PDF</a>
                <button type="button" className="secondary" onClick={() => sendWhatsApp(rx)}>💬 WhatsApp</button>
                <button type="button" className="secondary" onClick={() => sendEmail(rx)}>✉️ Email</button>
                {status[rx.id] && <span className="visit-meta">{status[rx.id]}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
