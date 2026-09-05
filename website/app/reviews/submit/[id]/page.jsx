'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const STARS = [1, 2, 3, 4, 5];

export default function SubmitReviewPage() {
  const { id } = useParams();
  const [state, setState] = useState('loading'); // loading | form | done | not_found | already | error
  const [firstName, setFirstName] = useState(null);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/review-requests/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('not_found');
        return res.json();
      })
      .then((data) => {
        setFirstName(data.client_first_name);
        if (data.status === 'pending') setState('form');
        else setState('already');
      })
      .catch(() => setState('not_found'));
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (rating < 1) {
      setError('Please pick a star rating first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/review-requests/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, comment, display_name: displayName }),
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
    return (
      <div className="section">
        <div className="container review-submit-narrow">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (state === 'not_found') {
    return (
      <div className="section">
        <div className="container review-submit-narrow">
          <h1 className="page-title">Link not found</h1>
          <p className="page-lede">This review link doesn&apos;t look right. Please check the link we sent you, or get in touch.</p>
        </div>
      </div>
    );
  }

  if (state === 'already') {
    return (
      <div className="section">
        <div className="container review-submit-narrow">
          <h1 className="page-title">Already submitted</h1>
          <p className="page-lede">This review link has already been used — thank you for taking the time!</p>
        </div>
      </div>
    );
  }

  if (state === 'done') {
    return (
      <div className="section">
        <div className="container review-submit-narrow">
          <h1 className="page-title">Thank you!</h1>
          <p className="page-lede">
            We really appreciate you taking the time to share your feedback. Our team will review it shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="container review-submit-narrow">
        <span className="eyebrow">Tell us how we did</span>
        <h1 className="page-title">{firstName ? `Hi ${firstName}, how was your visit?` : 'How was your visit?'}</h1>
        <p className="page-lede">Your feedback helps other pet owners in Sharjah find good care — and helps us keep improving.</p>

        <form className="card review-submit-form" onSubmit={handleSubmit}>
          <div className="star-picker" role="radiogroup" aria-label="Rating">
            {STARS.map((n) => (
              <button
                key={n}
                type="button"
                className="star-picker-star"
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                aria-pressed={rating === n}
                onMouseEnter={() => setHoverRating(n)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(n)}
              >
                {(hoverRating || rating) >= n ? '★' : '☆'}
              </button>
            ))}
          </div>

          <label htmlFor="comment">Your review (optional)</label>
          <textarea
            id="comment"
            rows={5}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What went well? Anything we could do better?"
          />

          <label htmlFor="displayName">Show your name as (optional)</label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Sarah K."
          />
          <p className="review-submit-hint">Leave blank and we&apos;ll just show your first name and last initial.</p>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Review'}
          </button>
        </form>
      </div>
    </div>
  );
}
