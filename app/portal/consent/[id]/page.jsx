// app/portal/consent/[id]/page.jsx
// Client-facing: review a consent form and sign it digitally by typing a
// full name — an alternative to signing in person on a staff device.
// Shared as a link via WhatsApp from the consult/hospitalization page
// ("Send via WhatsApp to Sign"). Submitting creates the same kind of
// record an in-person signature does (see app/api/consent-form-requests).

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function ConsentSigningPage() {
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

  if (state === 'loading') {
    return <p className="portal-loading">Loading...</p>;
  }

  if (state === 'not_found') {
    return (
      <div className="portal-page">
        <header className="portal-header">
          <img src="/logo.png" alt="Europets Clinic" />
        </header>
        <div className="portal-card">
          <h1>Link not found</h1>
          <p>This consent form link doesn&apos;t look right. Please check the link we sent you, or get in touch.</p>
        </div>
      </div>
    );
  }

  if (state === 'already') {
    return (
      <div className="portal-page">
        <header className="portal-header">
          <img src="/logo.png" alt="Europets Clinic" />
        </header>
        <div className="portal-card">
          <h1>Already signed</h1>
          <p>This consent form has already been signed — thank you!</p>
        </div>
      </div>
    );
  }

  if (state === 'done') {
    return (
      <div className="portal-page">
        <header className="portal-header">
          <img src="/logo.png" alt="Europets Clinic" />
        </header>
        <div className="portal-card">
          <h1>Thank you!</h1>
          <p>Your signature has been received — our team has it on file.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-page">
      <header className="portal-header">
        <img src="/logo.png" alt="Europets Clinic" />
        <p className="tagline">Kind, caring, and compassionate veterinary care</p>
      </header>

      <div className="portal-card">
        <h1>{request.form_label}</h1>
        {request.patient_name && <p className="visit-meta">For {request.patient_name}</p>}
        <p>Please read the form below, then type your full name at the bottom to sign it.</p>

        <div className="consent-text-box">{request.form_text}</div>

        <form onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Full name (this is your signature)
            <input
              required
              value={signedByName}
              onChange={(e) => setSignedByName(e.target.value)}
              placeholder="Type your full legal name"
            />
          </label>
          <label>
            Relationship to pet (optional)
            <input
              value={signedByRelationship}
              onChange={(e) => setSignedByRelationship(e.target.value)}
              placeholder="e.g. Owner"
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Signing...' : 'Sign'}
          </button>
        </form>
      </div>

      <p className="portal-footer">Your signature is recorded securely and shared only with the clinic.</p>
    </div>
  );
}
