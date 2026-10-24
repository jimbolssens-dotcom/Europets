// lib/websiteUrl.js
// The clinic website's address for links we send (pay links, settle-bill
// links, reminders): epc.vet. A setting pointing at a long *.vercel.app
// address (a deployment's own URL, which works but looks odd to clients) is
// ignored. Pure, so it can be tested (tests/website-url.test.mjs).

export function websiteUrl(env = process.env) {
  const set = String(env.NEXT_PUBLIC_WEBSITE_URL || '').trim().replace(/\/+$/, '');
  return set && !/\.vercel\.app$/i.test(set) ? set : 'https://epc.vet';
}
