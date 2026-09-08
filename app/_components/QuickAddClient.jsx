// app/_components/QuickAddClient.jsx
// Minimal "add a client" form for the Home dashboard's quick-add panel —
// just what POST /api/clients actually requires (full_name) plus a phone
// and email, unlike the full Clients page form (multi-phone editor,
// Emirates ID scan, duplicate detection, TRN/address/emirate). Reach for
// the Clients page itself for that fuller record.

'use client';

import { useState } from 'react';

export default function QuickAddClient() {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+971 ');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setCreated(null);

    const phones = phone.replace(/\D/g, '').length > 3 ? [{ phone, label: 'Mobile', is_whatsapp: true }] : [];

    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName, phones, email }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error || 'Failed to add client');
      return;
    }
    setCreated(data);
    setFullName('');
    setPhone('+971 ');
    setEmail('');
  }

  return (
    <form className="card quick-add-form" onSubmit={handleSubmit}>
      <h3>Add Client</h3>
      {error && <p className="error">{error}</p>}
      {created && (
        <p className="quick-add-success">
          Added <a href={`/clients/${created.id}`}>{created.full_name}</a>.
        </p>
      )}
      <input
        placeholder="Full name"
        required
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
      />
      <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <input
        placeholder="Email (optional)"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button type="submit" disabled={submitting}>
        {submitting ? 'Adding...' : 'Add Client'}
      </button>
    </form>
  );
}
