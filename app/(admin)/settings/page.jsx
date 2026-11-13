// app/settings/page.jsx
// Clinic identity used on every tax invoice: legal name, TRN, address,
// contact info. One settings row for the whole clinic.

'use client';

import AutoScreenSwitchToggle from '@/app/_components/AutoScreenSwitchToggle';
import { useEffect, useState } from 'react';
import InfoHint from '@/app/_components/InfoHint';

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
  booking_morning_start: '09:00',
  booking_morning_end: '13:00',
  booking_afternoon_start: '16:30',
  booking_afternoon_end: '19:00',
  booking_surgery_start: '10:30',
  booking_surgery_end: '13:00',
  client_app_theme: 'dark',
  prescribing_vet_id: '',
};

export default function SettingsPage() {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const [vets, setVets] = useState([]);
  useEffect(() => {
    fetch('/api/staff?role=vet')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => Array.isArray(d) && setVets(d.filter((v) => v.active !== false)))
      .catch(() => {});
  }, []);

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
          booking_morning_start: (data.booking_morning_start || '09:00').slice(0, 5),
          booking_morning_end: (data.booking_morning_end || '13:00').slice(0, 5),
          booking_afternoon_start: (data.booking_afternoon_start || '16:30').slice(0, 5),
          booking_afternoon_end: (data.booking_afternoon_end || '19:00').slice(0, 5),
          booking_surgery_start: (data.booking_surgery_start || '10:30').slice(0, 5),
          booking_surgery_end: (data.booking_surgery_end || '13:00').slice(0, 5),
          client_app_theme: data.client_app_theme || 'dark',
          prescribing_vet_id: data.prescribing_vet_id || '',
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
    <div className="settings-page">
      <div className="page-header">
        <h1>Clinic Settings</h1>
        <div className="page-header-actions">
          <AutoScreenSwitchToggle />
        </div>
      </div>

      <h2>
        Rooms &amp; Staff{' '}
        <InfoHint>Managed occasionally, not day to day — tucked in here instead of the main nav.</InfoHint>
      </h2>
      <div className="home-links settings-links">
        <a href="/rooms">Rooms</a>
        <a href="/staff">Staff</a>
        <a href="/staff/roster">Staff Roster</a>
        <a href="/vaccine-protocols">Vaccine Protocols</a>
      </div>

      <h2>
        More{' '}
        <InfoHint>Used less often than the main nav pages — tucked in here to keep that bar readable.</InfoHint>
      </h2>
      <div className="home-links settings-links">
        <a href="/reviews">Reviews</a>
        <a href="/catalog">Catalog</a>
        <a href="/policies">Policies</a>
        <a href="/accounting">Accounting</a>
        <a href="/empty-reports">Empty Reports</a>
        <a href="/storage">Storage</a>
      </div>

      <h2>
        Clinic Identity{' '}
        <InfoHint>This appears on every Tax Invoice PDF — required for UAE FTA VAT compliance.</InfoHint>
      </h2>
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
<div className="settings-row">
        <label>
          Phone (landline)
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>
        <label>
          Phone 2 (landline)
          <input value={form.phone2} onChange={(e) => setForm({ ...form, phone2: e.target.value })} />
        </label>
        </div>
        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label>
          Prescriptions in the name of
          <select value={form.prescribing_vet_id} onChange={(e) => setForm({ ...form, prescribing_vet_id: e.target.value })}>
            <option value="">The vet chosen on each prescription</option>
            {vets.map((v) => (
              <option key={v.id} value={v.id}>{v.full_name}</option>
            ))}
          </select>
        </label>

        <h3>
          Medication Administration Fees{' '}
          <InfoHint>
            Charged automatically as a second invoice line whenever a medication is invoiced with
            that method — see the Catalog page to mark which methods each medication supports.
          </InfoHint>
        </h3>
<div className="settings-row settings-row-3">
        <label>
          Dispensing (AED)
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.dispensing_fee}
            onChange={(e) => setForm({ ...form, dispensing_fee: e.target.value })}
          />
        </label>
        <label>
          SC injection (AED)
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.sc_injection_fee}
            onChange={(e) => setForm({ ...form, sc_injection_fee: e.target.value })}
          />
        </label>
        <label>
          IM injection (AED)
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.im_injection_fee}
            onChange={(e) => setForm({ ...form, im_injection_fee: e.target.value })}
          />
        </label>
        </div>

        <h3>
          Post-Op Care Baselines{' '}
          <InfoHint>
            The standard care instructions we hand out after a surgical or dental procedure —
            approve the wording here once. Whenever a vet drafts a specific patient&apos;s post-op
            release form with AI on the consult page, this is the baseline it starts from and
            departs from only where that case&apos;s own notes give a clear reason to.
          </InfoHint>
        </h3>
        <label>
          Surgical baseline
          <textarea
            rows={3}
            placeholder="e.g. Keep the incision dry and covered for 10 days. Restrict activity — leash walks only, no running or jumping. Use the e-collar at all times unless supervised..."
            value={form.surgical_postop_baseline}
            onChange={(e) => setForm({ ...form, surgical_postop_baseline: e.target.value })}
          />
        </label>
        <label>
          Dental baseline
          <textarea
            rows={3}
            placeholder="e.g. Soft food only for 3-5 days. No hard chews or toys for 2 weeks. Watch for excessive drooling, bleeding, or reluctance to eat and call us if it persists..."
            value={form.dental_postop_baseline}
            onChange={(e) => setForm({ ...form, dental_postop_baseline: e.target.value })}
          />
        </label>

        <h3>
          Client Self-Booking Hours <span className="visit-meta">(surgery = spay, castration, dental)</span>{' '}
          <InfoHint>
            The windows a client can request a slot in on the booking portal — a slot only shows
            up within these hours, and only with a doctor the roster flags in for that kind (Staff
            Roster page). Morning/afternoon apply to a plain consult; spay/castration/dental use
            their own narrower Surgery window below instead, regardless of what the morning window
            says.
          </InfoHint>
        </h3>
<div className="settings-row">
        <label>
          Morning start
          <input
            type="time"
            value={form.booking_morning_start}
            onChange={(e) => setForm({ ...form, booking_morning_start: e.target.value })}
          />
        </label>
        <label>
          Morning end
          <input
            type="time"
            value={form.booking_morning_end}
            onChange={(e) => setForm({ ...form, booking_morning_end: e.target.value })}
          />
        </label>
        </div>
<div className="settings-row">
        <label>
          Afternoon start
          <input
            type="time"
            value={form.booking_afternoon_start}
            onChange={(e) => setForm({ ...form, booking_afternoon_start: e.target.value })}
          />
        </label>
        <label>
          Afternoon end
          <input
            type="time"
            value={form.booking_afternoon_end}
            onChange={(e) => setForm({ ...form, booking_afternoon_end: e.target.value })}
          />
        </label>
        </div>
<div className="settings-row">
        <label>
          Surgery start{' '}
          <InfoHint>
            No surgery-type slot is ever offered before this time, even if the morning window
            above starts earlier.
          </InfoHint>
          <input
            type="time"
            value={form.booking_surgery_start}
            onChange={(e) => setForm({ ...form, booking_surgery_start: e.target.value })}
          />
        </label>
        <label>
          Surgery end{' '}
          <InfoHint>
            Every surgery-type slot must finish by this time — anesthesia/recovery needs the rest
            of the day clear.
          </InfoHint>
          <input
            type="time"
            value={form.booking_surgery_end}
            onChange={(e) => setForm({ ...form, booking_surgery_end: e.target.value })}
          />
        </label>
        </div>

        <h3>
          Client App Appearance{' '}
          <InfoHint>
            Which look the client-facing app (app/client-app — pets, invoices, appointments, reports)
            renders for every client. This is a clinic-wide choice, not something each client picks
            for themselves.
          </InfoHint>
        </h3>
        <label>
          Theme
          <select
            value={form.client_app_theme}
            onChange={(e) => setForm({ ...form, client_app_theme: e.target.value })}
          >
            <option value="dark">Dark (Hexfield)</option>
            <option value="light">Light (original)</option>
          </select>
        </label>

        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </form>
    </div>
  );
}
