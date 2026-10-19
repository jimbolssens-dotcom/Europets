'use client';

// app/_components/SocialDutyBanner.jsx
// Today's Social post duty (lib/socialDuty.js) on the phone app's home
// screen: for the person whose turn it is, a banner that stays until
// they've made the post. Everyone else sees nothing; the duty person sees a
// thank-you once it's done.

import { useEffect, useState } from 'react';

export default function SocialDutyBanner({ staffId }) {
  const [duty, setDuty] = useState(null);

  useEffect(() => {
    if (!staffId) return;
    fetch('/api/social-duty')
      .then((res) => res.json())
      .then((d) => setDuty(d.duty || null))
      .catch(() => {});
  }, [staffId]);

  if (!duty || duty.staff_id !== staffId) return null;
  if (duty.done_at) {
    return <p className="social-duty-done">✓ Today&apos;s post is done. Thank you!</p>;
  }
  return (
    <a href="/social/new?duty=today" className="social-duty-banner">
      <span className="social-duty-icon" aria-hidden="true">📸</span>
      <span className="social-duty-text">
        <strong>Today&apos;s post is yours</strong>
        <span>{duty.idea?.title || 'Any real moment from today'}</span>
        <span className="social-duty-hint">A photo or a 10 second clip is enough. The AI writes it.</span>
      </span>
      <span className="social-duty-go">Start</span>
    </a>
  );
}
