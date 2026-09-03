// app/settings/page.jsx
// Clinic identity used on every tax invoice: legal name, TRN, address,
// contact info. One settings row for the whole clinic.

'use client';

import { useEffect, useState } from 'react';

const emptyForm = {
  legal_name: '',
  trn: '',
  address: '',
  phone: '',
  phone2: '',
  email: '',
  dispensing_fee: '',
  sc_injection_fee: '',
  im_injection_fee: '',
  surgical_postop_baseline: '',
  dental_postop_baseline: '',
};

export default function SettingsPage() {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/clinic-settings')
      .then((res) => res.json())
      .then((data) => {
        setForm({
          legal_name: data.legal_name || '',
          trn: data.trn || '',
          address: data.address || '',
          phone: data.phone || '',
          phone2: data.phone2 || '',
          email: data.email || '',
          dispensing_fee: data.dispensing_fee || 0,
          sc_injection_fee: data.sc_injection_fee || 0,
          im_injection_fee: data.im_injection_fee || 0,
          surgical_postop_baseline: data.surgical_postop_baseline || '',
          dental_postop_baseline: data.dental_postop_baseline || '',
        });
        setLoading(false);
      });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    const res = await fetch('/api/clinic-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Failed to save settings');
    } else {
      setSaved(true);
    }
    setSaving(false);
  }

  if (loading) return <p>Loading settings...</p>;

  return (
    <div>
      <h1>Clinic Settings</h1>
      <p className="visit-meta">
        This appears on every Tax Invoice PDF — required for UAE FTA VAT compliance.
      </p>
      <form className="card" onSubmit={handleSubmit}>
        {error && <p className="error">{error}</p>}
        {saved && !error && <p style={{ color: '#1a7a3d' }}>Saved.</p>}
        <label>
          Legal name
          <input
            required
            value={form.legal_name}
            onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
          />
        </label>
        <label>
          TRN (Tax Registration Number)
          <input
            placeholder="100XXXXXXXXXXXX"
            value={form.trn}
            onChange={(e) => setForm({ ...form, trn: e.target.value })}
          />
        </label>
        <label>
          Address
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </label>
        <label>
          Phone (landline)
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>
        <label>
          Phone 2 (landline)
          <input value={form.phone2} onChange={(e) => setForm({ ...form, phone2: e.target.value })} />
        </label>
        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>

        <h3>Medication Administration Fees</h3>
        <p className="visit-meta">
          Charged automatically as a second invoice line whenever a medication is invoiced with
          that method — see the Catalog page to mark which methods each medication supports.
        </p>
        <label>
          Dispensing fee (AED)
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.dispensing_fee}
            onChange={(e) => setForm({ ...form, dispensing_fee: e.target.value })}
          />
        </label>
        <label>
          Subcutaneous (SC) injection fee (AED)
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.sc_injection_fee}
            onChange={(e) => setForm({ ...form, sc_injection_fee: e.target.value })}
          />
        </label>
        <label>
          Intramuscular (IM) injection fee (AED)
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.im_injection_fee}
            onChange={(e) => setForm({ ...form, im_injection_fee: e.target.value })}
          />
        </label>

        <h3>Post-Op Care Baselines</h3>
        <p className="visit-meta">
          The standard care instructions we hand out after a surgical or dental procedure —
          approve the wording here once. Whenever a vet drafts a specific patient&apos;s post-op
          release form with AI on the consult page, this is the baseline it starts from and
          departs from only where that case&apos;s own notes give a clear reason to.
        </p>
        <label>
          Surgical baseline
          <textarea
            rows={6}
            placeholder="e.g. Keep the incision dry and covered for 10 days. Restrict activity — leash walks only, no running or jumping. Use the e-collar at all times unless supervised..."
            value={form.surgical_postop_baseline}
            onChange={(e) => setForm({ ...form, surgical_postop_baseline: e.target.value })}
          />
        </label>
        <label>
          Dental baseline
          <textarea
            rows={6}
            placeholder="e.g. Soft food only for 3-5 days. No hard chews or toys for 2 weeks. Watch for excessive drooling, bleeding, or reluctance to eat and call us if it persists..."
            value={form.dental_postop_baseline}
            onChange={(e) => setForm({ ...form, dental_postop_baseline: e.target.value })}
          />
        </label>

        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>

      <h2>Rooms &amp; Staff</h2>
      <p className="visit-meta">Managed occasionally, not day to day — tucked in here instead of the main nav.</p>
      <div className="home-links">
        <a href="/rooms">Rooms</a>
        <a href="/staff">Staff</a>
        <a href="/vaccine-protocols">Vaccine Protocols</a>
      </div>
    </div>
  );
}
