// app/global-error.js
// Root-level fallback — catches errors app/mobile/error.js can't (that
// boundary doesn't cover its own layout.js, e.g. AppVersionWatcher, or
// anything thrown before layout content even mounts). Same diagnostic
// intent: show the real error instead of Next's generic "Application
// error" message with no detail. Must render its own <html>/<body> since
// it replaces the root layout when active.

'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error('Global app error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ padding: '1.5rem', fontFamily: 'sans-serif' }}>
        <h1>Something went wrong</h1>
        <p>Please screenshot this and send it to Jim so it can be fixed — this detail isn&apos;t normally shown.</p>
        <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-word', color: '#b00020' }}>
          {error?.message || 'Unknown error'}
          {error?.digest && ` (digest: ${error.digest})`}
        </p>
        <button type="button" onClick={() => reset()}>
          Try Again
        </button>
        <button type="button" onClick={() => window.location.reload()} style={{ marginLeft: '0.5rem' }}>
          Reload Page
        </button>
      </body>
    </html>
  );
}
