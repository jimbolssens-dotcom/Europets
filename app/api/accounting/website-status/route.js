// app/api/accounting/website-status/route.js
// GET -> live DNS status for every hostname the clinic's web system depends
// on, checked fresh on every request rather than hand-maintained — so the
// /accounting/website reference page can't silently go stale the way the
// DNS records themselves did for months before this got sorted out.
//
// Behind the accounting password gate (see middleware.js's
// needsAccountingPassword) like the rest of /api/accounting/*.

import { resolve4, resolveCname } from 'node:dns/promises';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// One row per hostname worth watching — `expect` documents what a healthy
// answer looks like so the page can flag a drift (e.g. someone accidentally
// re-pointing a CNAME) instead of just reporting "resolves: yes/no".
const CHECKS = [
  { host: 'epc.vet', kind: 'A', expect: '76.76.21.21' },
  { host: 'www.epc.vet', kind: 'CNAME', expect: 'cname.vercel-dns.com' },
  { host: 'portal.epc.vet', kind: 'CNAME', expect: 'cname.vercel-dns.com' },
  { host: 'europetshospital.com', kind: 'A', expect: '76.76.21.21' },
  { host: 'www.europetshospital.com', kind: 'CNAME', expect: 'cname.vercel-dns.com' },
  { host: 'portal.europetshospital.com', kind: 'CNAME', expect: 'cname.vercel-dns.com' },
  { host: 'europetsclinic.com', kind: 'A', expect: null },
];

async function checkOne({ host, kind, expect }) {
  try {
    const answers = kind === 'A' ? await resolve4(host) : await resolveCname(host);
    const matches = expect ? answers.some((a) => a.toLowerCase().replace(/\.$/, '') === expect.toLowerCase()) : true;
    return { host, kind, resolved: true, answers, expect, ok: matches };
  } catch (err) {
    // ENOTFOUND/ENODATA both mean "doesn't resolve" — the only outcome
    // europetsclinic.com should ever show, since it isn't a registered
    // domain at all.
    return { host, kind, resolved: false, answers: [], expect, ok: expect === null, error: err.code || err.message };
  }
}

export async function GET() {
  const results = await Promise.all(CHECKS.map(checkOne));
  return NextResponse.json({ checked_at: new Date().toISOString(), results });
}
