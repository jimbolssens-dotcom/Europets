/** @type {import('next').NextConfig} */
const nextConfig = {
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
        headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
      },
      {
        // Same reasoning for the hospitalization API routes the portal
        // page above polls — force-dynamic stops Next's own caching, but
        // an explicit header is what actually tells any CDN or in-app
        // browser sitting in between not to cache the response either.
        source: '/api/hospitalizations/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
      },
      {
        // The mobile app is launched from a home-screen icon (see
        // public/mobile-manifest.json) straight into this document, with
        // no browser chrome and thus no pull-to-refresh — a phone that
        // cached an old copy would otherwise keep opening that same stale
        // version indefinitely. The in-app Refresh button (app/mobile/
        // page.js) is the explicit escape hatch; this stops it from being
        // needed in the first place.
        source: '/mobile/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
      },
    ];
  },
};

module.exports = nextConfig;
