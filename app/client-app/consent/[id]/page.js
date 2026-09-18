// app/client-app/consent/[id]/page.js
// Client-app version of app/portal/consent/[id]/page.jsx — review a
// consent form and sign it by typing a full name, styled to match the rest
// of the client app instead of bouncing out to the plainer public portal
// page. Hits the exact same public GET/POST /api/consent-form-requests/:id
// endpoints as that page, so a link shared over WhatsApp still works too —
// this is just the destination reached from the client app's own "Consent
// Forms" list on the home dashboard.

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import HexIcon from '@/app/_components/HexIcon';

export default function ClientAppConsentPage() {
  const { id } = useParams();
  const [state, setState] = useState('loading'); // loading | pending | already | done | not_found
  const [request, setRequest] = useState(null);
  const [signedByName, setSignedByName] = useState('');
  const [signedByRelationship, setSignedByRelationship] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/consent-form-requests/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('not_found');
        return res.json();
      })
      .then((data) => {
        setRequest(data);
        setState(data.status === 'pending' ? 'pending' : 'already');
      })
      .catch(() => setState('not_found'));
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!signedByName.trim()) {
      setError('Please type your full name to sign.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/consent-form-requests/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signed_by_name: signedByName, signed_by_relationship: signedByRelationship }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Something went wrong — please try again.');
      return;
    }
    setState('done');
  }

  if (state === 'loading') return null;

  if (state === 'not_found') {
    return (
      <div className="mobile-page">
        <p className="mobile-subtitle">This consent form link doesn&apos;t look right — please contact the clinic.</p>
        <Link href="/client-app" className="mobile-link-btn">
          ← Home
        </Link>
      </div>
    );
  }

  if (state === 'already') {
    return (
      <div className="mobile-page">
        <HexIcon className="client-app-confirm-icon">✅</HexIcon>
        <h1>Already signed</h1>
        <p className="mobile-subtitle">This consent form has already been signed — thank you!</p>
        <Link href="/client-app" className="mobile-link-btn">
          ← Home
        </Link>
      </div>
    );
  }

  if (state === 'done') {
    return (
      <div className="mobile-page">
        <HexIcon className="client-app-confirm-icon">✅</HexIcon>
        <h1>Thank you!</h1>
        <p className="mobile-subtitle">Your signature has been received — our team has it on file.</p>
        <Link href="/client-app" className="mobile-link-btn">
          ← Home
        </Link>
      </div>
    );
  }

  return (
    <div className="mobile-page">
      <Link href="/client-app" className="mobile-link-btn">
        ← Home
      </Link>
      <h1>{request.form_label}</h1>
      {request.patient_name && <p className="mobile-subtitle">For {request.patient_name}</p>}
      <p className="mobile-subtitle">Please read the form below, then type your full name to sign it.</p>

      <p className="client-app-report-text">{request.form_text}</p>

      <form onSubmit={handleSubmit} className="client-app-login-form">
        {error && <p className="client-app-login-error">{error}</p>}
        <label>
          Full name (this is your signature)
          <input
            required
            value={signedByName}
            onChange={(e) => setSignedByName(e.target.value)}
            placeholder="Type your full legal name"
            className="client-app-login-input"
          />
        </label>
        <label>
          Relationship to pet (optional)
          <input
            value={signedByRelationship}
            onChange={(e) => setSignedByRelationship(e.target.value)}
            placeholder="e.g. Owner"
            className="client-app-login-input"
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing...' : 'Sign'}
        </button>
      </form>
    </div>
  );
}
