// app/reviews/page.jsx
// Reviews/testimonials: links are sent from a client's own page ("⭐
// Request a Review"), filled in with no login on the public website
// (website/app/reviews/submit/[id]), and land here for moderation before
// they can show up on the public site (website/app/reviews) — approving
// just flips status, nothing else is created (unlike an intake approval).

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Stars({ rating }) {
  return <span aria-label={`${rating} out of 5 stars`}>{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</span>;
}

export default function ReviewsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(null);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const load = () =>
    fetch('/api/review-requests')
      .then((res) => res.json())
      .then((data) => {
        setRequests(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    load();
    const channel = supabase
      .channel('review-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'review_requests' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  function submitUrl(id) {
    const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL || 'https://epc.vet';
    return `${websiteUrl}/reviews/submit/${id}`;
  }

  async function copyLink(id) {
    await navigator.clipboard.writeText(submitUrl(id));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function moderate(id, action) {
    setReviewing(id);
    setError(null);
    const res = await fetch(`/api/review-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setReviewing(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || `Failed to ${action} this review`);
      return;
    }
    load();
  }

  async function cancelLink(id) {
    if (!confirm('Cancel this unused review link?')) return;
    await fetch(`/api/review-requests/${id}`, { method: 'DELETE' });
    load();
  }

  if (loading) return <p>Loading reviews...</p>;

  const pending = requests.filter((r) => r.status === 'pending');
  const submitted = requests.filter((r) => r.status === 'submitted');
  const approved = requests.filter((r) => r.status === 'approved').slice(0, 20);

  return (
    <div>
      <h1>Reviews</h1>
      <p className="visit-meta">
        Send clients a review link from their own client page (&ldquo;⭐ Request a Review&rdquo;). Submissions
        land here for moderation — approving is what makes a review show up on the public website.
      </p>

      {error && <p className="error">{error}</p>}

      {pending.length > 0 && (
        <>
          <h2>Sent, Awaiting Submission</h2>
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Link</th>
                <th>Sent</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id}>
                  <td>
                    <a href={`/clients/${r.clients?.id}`}>{r.clients?.full_name || 'Unknown client'}</a>
                  </td>
                  <td>
                    <button type="button" onClick={() => copyLink(r.id)}>
                      {copiedId === r.id ? 'Copied!' : '🔗 Copy Link'}
                    </button>
                  </td>
                  <td>{formatDateTime(r.created_at)}</td>
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
            <div key={r.id} className="card">
              <p>
                <strong>{r.clients?.full_name || 'Unknown client'}</strong> &middot; <Stars rating={r.rating} />
                {r.display_name && <> &middot; will show as &ldquo;{r.display_name}&rdquo;</>}
              </p>
              {r.comment && <p>&ldquo;{r.comment}&rdquo;</p>}
              <p className="visit-meta">Submitted {formatDateTime(r.submitted_at)}</p>
              <button type="button" onClick={() => moderate(r.id, 'approve')} disabled={reviewing === r.id}>
                ✅ Approve
              </button>{' '}
              <button type="button" onClick={() => moderate(r.id, 'reject')} disabled={reviewing === r.id}>
                ❌ Reject
              </button>
            </div>
          ))}
        </>
      )}

      {approved.length > 0 && (
        <>
          <h2>Approved (Live on Website)</h2>
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Rating</th>
                <th>Comment</th>
                <th>Approved</th>
              </tr>
            </thead>
            <tbody>
              {approved.map((r) => (
                <tr key={r.id}>
                  <td>{r.display_name || r.clients?.full_name}</td>
                  <td>
                    <Stars rating={r.rating} />
                  </td>
                  <td>{r.comment}</td>
                  <td>{formatDateTime(r.reviewed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {requests.length === 0 && <p className="visit-meta">No review requests yet — send one from a client&apos;s page.</p>}
    </div>
  );
}
