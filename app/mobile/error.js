// app/mobile/error.js
// Temporary diagnostic error boundary — a user hit "Application error: a
// client-side exception has occurred" on the mobile app with no further
// detail (Next.js's production build strips the real message from its
// default error UI). This shows the actual error text/digest instead, so
// the next time it happens we get something to actually debug from
// instead of a screenshot of the generic message.
//
// Catches errors thrown by app/mobile/page.js and other route content
// inside app/mobile/layout.js — not the layout itself; see
// app/global-error.js for the root-level fallback that also covers that.

'use client';

import { useEffect } from 'react';

export default function MobileError({ error, reset }) {
  useEffect(() => {
    console.error('Mobile app error:', error);
  }, [error]);

  return (
    <div className="mobile-page">
      <h1>Something went wrong</h1>
      <p className="mobile-hint">
        Please screenshot this and send it to Jim so it can be fixed — this detail isn&apos;t normally
        shown.
      </p>
      <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-word', color: '#b00020' }}>
        {error?.message || 'Unknown error'}
        {error?.digest && ` (digest: ${error.digest})`}
      </p>
      <button type="button" onClick={() => reset()}>
        Try Again
      </button>
      <button type="button" className="mobile-secondary-action" onClick={() => window.location.reload()}>
        Reload Page
      </button>
    </div>
  );
}
