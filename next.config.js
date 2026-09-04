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
    ];
  },
};

module.exports = nextConfig;
