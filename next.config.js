// Vercel sets this automatically at build time to the deployed commit —
// no configuration needed. Falls back to a timestamp locally (`next dev`),
// which just means every local restart looks like a "new version", which
// is harmless (see AppVersionWatcher.jsx: it only ever compares against
// whatever build the phone loaded most recently).
const buildId = process.env.VERCEL_GIT_COMMIT_SHA || `dev-${Date.now()}`;

// Belt-and-suspenders no-store: some older mobile WebViews (and anything
// still speaking HTTP/1.0-era caching) look at Pragma/Expires instead of
// or in addition to Cache-Control.
const NO_STORE_HEADERS = [
  { key: 'Cache-Control', value: 'no-store, must-revalidate' },
  { key: 'Pragma', value: 'no-cache' },
  { key: 'Expires', value: '0' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  async headers() {
    return [
      {
        // Client-facing portal links are shared once (e.g. over WhatsApp)
        // and then reloaded from that same URL repeatedly by owners
        // checking in — mobile browsers and in-app browsers (WhatsApp's
        // included) are prone to caching that document, which then keeps
        // showing whatever was true the first time it was opened no
        // matter how much new data comes in. Force every hop (browser,
        // in-app browser, CDN) to always refetch it.
        source: '/portal/:path*',
        headers: NO_STORE_HEADERS,
      },
      {
        // Same reasoning for the hospitalization API routes the portal
        // page above polls — force-dynamic stops Next's own caching, but
        // an explicit header is what actually tells any CDN or in-app
        // browser sitting in between not to cache the response either.
        source: '/api/hospitalizations/:path*',
        headers: NO_STORE_HEADERS,
      },
      {
        // Same gap existed here — voiding an invoice (or removing a line
        // item) updated the database fine, but reloading it afterward
        // could still be served a cached pre-change snapshot from an edge/
        // CDN layer even with the route handler itself set to
        // force-dynamic, making the action look like it silently failed.
        source: '/api/invoices/:path*',
        headers: NO_STORE_HEADERS,
      },
      {
        // Same gap as invoices above — the video-consult route is polled
        // by both the staff consult page and the client's portal join page
        // waiting on the same room, so a stale cached response here would
        // show "no call yet" long after one was actually created.
        source: '/api/visits/:path*',
        headers: NO_STORE_HEADERS,
      },
      {
        // The mobile app is launched from a home-screen icon (see
        // public/mobile-manifest.json) straight into this document, with
        // no browser chrome and thus no pull-to-refresh — a phone that
        // cached an old copy would otherwise keep opening that same stale
        // version indefinitely. This alone isn't the full fix for an
        // *installed* icon though — see AppVersionWatcher.jsx (mounted in
        // app/mobile/layout.js) for why, and the actual mechanism that
        // catches a copy this header can't.
        source: '/mobile/:path*',
        headers: NO_STORE_HEADERS,
      },
      {
        // Same installed-icon caching risk as /mobile above — the client
        // app is meant to be added to a client's home screen too (see
        // public/client-app-manifest.json).
        source: '/client-app/:path*',
        headers: NO_STORE_HEADERS,
      },
      {
        // The main staff app — /messages, /clients, /consults,
        // /appointments, and everything else under app/(admin) — is
        // installable as a standalone PWA too (public/manifest.json,
        // display: "standalone"; see the comment in app/layout.js). It has
        // the exact same "installed icon caching risk" as /mobile and
        // /client-app above, but never got the same protection: an
        // installed staff window kept serving whatever page it first
        // loaded — a Messenger layout fix included — no matter how many
        // deploys shipped after, since nothing told the browser to always
        // refetch the document. Everything except static assets and API
        // routes, which don't need it (or set their own caching already).
        source: '/:path((?!api|_next).*)',
        headers: NO_STORE_HEADERS,
      },
    ];
  },
};

module.exports = nextConfig;
