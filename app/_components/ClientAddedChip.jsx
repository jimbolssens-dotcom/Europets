// app/_components/ClientAddedChip.jsx
// "📱 Added by the client" on a pet the owner added in the client app
// (migration 262): a chip on its page until a staff member checks the
// details (name, species, sex, chip) and taps it to mark them checked.

'use client';

import { useState } from 'react';
import { formatShortDate } from '@/lib/formatTimestamp';

export default function ClientAddedChip({ patient, onChecked }) {
  const [saving, setSaving] = useState(false);
  if (!patient?.added_by_client_at || patient.client_details_checked_at) return null;
  async function check() {
    if (!confirm(`Have you checked ${patient.name}'s details (name, species, sex, date of birth, microchip) with the owner?`)) return;
    setSaving(true);
    const res = await fetch(`/api/patients/${patient.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_details_checked_at: new Date().toISOString() }),
    });
    setSaving(false);
    if (res.ok) onChecked?.(await res.json().catch(() => null));
  }
  return (
    <button type="button" className="patient-chip client-added-chip" onClick={check} disabled={saving}
      title={`Added by the owner in the client app on ${formatShortDate(patient.added_by_client_at)}. Tap once you've checked the details with them.`}>
      📱 Added by the client{saving ? '…' : ' · check'}
    </button>
  );
}
