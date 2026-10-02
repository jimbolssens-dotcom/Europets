// lib/appOrigin.js
// The canonical origin for a link a CLIENT will actually open — a portal
// link, a shared PDF — built client-side (a staff page's Share/Copy
// button). NEXT_PUBLIC_APP_URL when it's set, the same domain the
// server-side-only APP_URL already points these same kinds of links at
// when built server-side (see lib/consentForms.js,
// lib/hospitalizationPortalLink.js, lib/vaccinationReminders.js, ...) —
// APP_URL itself can't be read here since it has no NEXT_PUBLIC_ prefix,
// so client code never sees it.
//
// Falls back to window.location.origin so nothing breaks before
// NEXT_PUBLIC_APP_URL is configured — but that fallback reflects
// whatever domain STAFF happen to be browsing the admin panel from right
// now (commonly the raw *.vercel.app deployment URL), not necessarily
// the client-facing portal domain, so it's a stopgap, not the intended
// steady state. Set NEXT_PUBLIC_APP_URL to the same value as APP_URL.
export function appOrigin() {
  return process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
}
