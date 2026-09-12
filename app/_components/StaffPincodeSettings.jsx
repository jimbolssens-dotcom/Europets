// app/_components/StaffPincodeSettings.jsx
// Lets whoever's logged into Accounting rotate the shared staff PIN
// without touching the STAFF_PINCODE environment variable — e.g. when a
// staff member leaves. Never fetches or displays the current PIN itself,
// only whether one has been set here versus still using the environment
// variable's default.

'use client';

import { useEffect, useState } from 'react';

export default function StaffPincodeSettings() {
  const [isCustom, setIsCustom] = useState(null);
  const [pincode, setPincode] = useState('');
  const [confirmPincode, setConfirmPincode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/accounting/staff-pincode')
      .then((res) => res.json())
      .then((data) => setIsCustom(!!data.isCustom));
  }, []);

  async function save(e) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (pincode !== confirmPincode) {
      setError('The two PINs don’t match');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/accounting/staff-pincode', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pincode }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || 'Failed to save PIN');
      return;
    }
    setPincode('');
    setConfirmPincode('');
    setIsCustom(true);
    setSaved(true);
  }

  return (
    <details className="card">
      <summary>🔑 Staff Login PIN</summary>
      <p className="visit-meta">
        The shared PIN everyone uses to log into the app from /login. Changing it here signs
        everyone out — reception, vets, and anyone else — the next time their login is checked, so
        share the new one with whoever still needs it right away.
        {isCustom === false && ' Currently using the default from the app’s environment setup.'}
        {isCustom === true && ' Currently set here (overrides the environment default).'}
      </p>
      <form className="form-grid" onSubmit={save}>
        {error && <p className="error">{error}</p>}
        {saved && <p className="visit-meta">PIN updated.</p>}
        <input
          type="text"
          inputMode="numeric"
          placeholder="New PIN"
          value={pincode}
          onChange={(e) => setPincode(e.target.value)}
        />
        <input
          type="text"
          inputMode="numeric"
          placeholder="Confirm new PIN"
          value={confirmPincode}
          onChange={(e) => setConfirmPincode(e.target.value)}
        />
        <button type="submit" disabled={saving || !pincode}>
          {saving ? 'Saving...' : 'Change PIN'}
        </button>
      </form>
    </details>
  );
}
