// app/intake/page.jsx
// New-Client Intake: generate a self-service link to send a first-time
// caller over WhatsApp, then review what they submit before it becomes a
// real client + patient(s) — approving creates those records; rejecting
// just discards the submission.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function petSummary(p) {
  return [p.name, p.species, p.breed].filter(Boolean).join(' · ');
}

export default function IntakePage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [draftPhones, setDraftPhones] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const [error, setError] = useState(null);

  const load = () =>
    fetch('/api/intake-requests')
      .then((res) => res.json())
      .then((data) => {
        setRequests(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    load();
    const channel = supabase
      .channel('intake-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intake_requests' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  function portalUrl(id) {
    return `${window.location.origin}/portal/intake/${id}`;
  }

  async function generateLink() {
    setGenerating(true);
    setError(null);
    const res = await fetch('/api/intake-requests', { method: 'POST' });
    setGenerating(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to generate an intake link');
      return;
    }
    load();
  }

  async function copyLink(id) {
    await navigator.clipboard.writeText(portalUrl(id));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function shareViaWhatsApp(id) {
    const phone = (draftPhones[id] || '').replace(/\D/g, '');
    if (!phone) return;
    const message = `Hi! Thanks for calling Europets Clinic. Please fill in your details and your pet's details here before your visit: ${portalUrl(
      id
    )}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  }

  async function cancelLink(id) {
    if (!confirm('Cancel this unused intake link?')) return;
    await fetch(`/api/intake-requests/${id}`, { method: 'DELETE' });
    load();
  }

  async function review(id, action) {
    setError(null);
    const res = await fetch(`/api/intake-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || `Failed to ${action} this request`);
      return;
    }
    load();
  }

  if (loading) return <p>Loading intake requests...</p>;

  const pending = requests.filter((r) => r.status === 'pending');
  const submitted = requests.filter((r) => r.status === 'submitted');
  const approved = requests.filter((r) => r.status === 'approved').slice(0, 10);

  return (
    <div>
      <h1>New-Client Intake</h1>
      <p className="visit-meta">
        Generate a link for a first-time caller to fill in their own and their pet&apos;s details before
        they come in. Submissions land here for review — approving creates the client and patient
        records.
      </p>

      {error && <p className="error">{error}</p>}

      <button type="button" onClick={generateLink} disabled={generating}>
        {generating ? 'Generating...' : '+ Generate Intake Link'}
      </button>

      {pending.length > 0 && (
        <>
          <h2>Awaiting Submission</h2>
          <table>
            <thead>
              <tr>
                <th>Link</th>
                <th>Created</th>
                <th>Send via WhatsApp</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id}>
                  <td>
                    <button type="button" onClick={() => copyLink(r.id)}>
                      {copiedId === r.id ? 'Copied!' : '🔗 Copy Link'}
                    </button>
                  </td>
                  <td>{formatDateTime(r.created_at)}</td>
                  <td>
                    <input
                      placeholder="Phone number"
                      value={draftPhones[r.id] || ''}
                      onChange={(e) => setDraftPhones({ ...draftPhones, [r.id]: e.target.value })}
                    />
                    <button type="button" onClick={() => shareViaWhatsApp(r.id)}>
                      💬 WhatsApp
                    </button>
                  </td>
                  <td>
                    <button type="button" onClick={() => cancelLink(r.id)}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {submitted.length > 0 && (
        <>
          <h2>Needs Review</h2>
          {submitted.map((r) => (
            <div key={r.id} className="intake-review-card">
              <p>
                <strong>{r.full_name}</strong> · {r.phone}
                {r.email && ` · ${r.email}`}
              </p>
              {r.address && <p className="visit-meta">{r.address}</p>}
              <ul>
                {(r.patients || []).map((p, i) => (
                  <li key={i}>{petSummary(p)}</li>
                ))}
              </ul>
              {r.notes && <p className="visit-meta">Notes: {r.notes}</p>}
              <p className="visit-meta">Submitted {formatDateTime(r.submitted_at)}</p>
              <div className="intake-review-actions">
                <button type="button" onClick={() => review(r.id, 'approve')}>
                  Approve
                </button>
                <button type="button" className="secondary" onClick={() => review(r.id, 'reject')}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {approved.length > 0 && (
        <>
          <h2>Recently Approved</h2>
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Approved</th>
              </tr>
            </thead>
            <tbody>
              {approved.map((r) => (
                <tr key={r.id}>
                  <td>
                    <a href={`/clients/${r.clients?.id}`}>{r.clients?.full_name}</a>
                  </td>
                  <td>{formatDateTime(r.reviewed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {pending.length === 0 && submitted.length === 0 && approved.length === 0 && (
        <p className="visit-meta">No intake links yet — generate one above.</p>
      )}
    </div>
  );
}
