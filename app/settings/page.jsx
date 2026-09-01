// app/settings/page.jsx
// Clinic identity used on every tax invoice: legal name, TRN, address,
// contact info. One settings row for the whole clinic.

'use client';

import { useEffect, useState } from 'react';

const emptyForm = { legal_name: '', trn: '', address: '', phone: '', email: '' };

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
          email: data.email || '',
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
          Phone
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>
        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
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
      </div>
    </div>
  );
}
