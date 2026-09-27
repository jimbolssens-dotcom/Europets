// app/(admin)/accounting/website/page.jsx
// The clinic's whole web system in one place — every domain, where its DNS
// actually lives, the login for each account behind it, and what's still
// open — for whoever holds the accounting password to use when something
// needs updating or paying for. Domain status is checked live against
// /api/accounting/website-status on every load instead of being a
// hand-maintained snapshot, since a stale "it's fine" note is exactly what
// let epc.vet's real DNS problem (it was on Wix, not 100WebSpace, the
// entire time) go unnoticed for months. Renewal dates and login
// credentials can't be auto-detected the same way — those still need a
// human to update this page when they actually change.

'use client';

import { useEffect, useState } from 'react';

const DOMAINS = [
  {
    name: 'epc.vet',
    tag: 'Primary domain',
    registrar: 'eNom, Inc. (bought via domain.com) — login at access.enom.com',
    registrarExpiry: '30 May 2027',
    dnsHost: "eNom's own \"Default\" DNS (Host Records panel). Moved off Wix this session — Wix was the real authoritative nameserver the whole time, so every earlier 100WebSpace record for this domain was never actually live.",
    serves: 'Apex + www → the public marketing site. portal. subdomain → the client/staff practice-management app.',
    records: [
      ['@', 'A', '76.76.21.21'],
      ['www', 'CNAME', 'cname.vercel-dns.com'],
      ['portal', 'CNAME', 'cname.vercel-dns.com'],
      ['@', 'MX (pri 10)', 'mbox.100ws.com'],
    ],
    note: 'Email (info@epc.vet) is hosted separately at 100WebSpace, not Wix or eNom — webmail at webmail.100ws.com. The MX record above is what keeps it working now DNS moved off Wix.',
    statusHosts: ['epc.vet', 'www.epc.vet', 'portal.epc.vet'],
  },
  {
    name: 'europetshospital.com',
    tag: 'Secondary domain',
    registrar: '100WebSpace — exact expiry not yet confirmed, check the Hosted/Registered Domains list.',
    registrarExpiry: 'Not yet confirmed',
    dnsHost: "100WebSpace's own nameservers (dns1.100ws.com / dns2.100ws.com) — genuinely authoritative here, unlike epc.vet.",
    serves: 'Redirects to www, which serves the same public marketing site as epc.vet. portal. subdomain confirmed live.',
    records: [
      ['@', 'A → redirect to www', '76.76.21.21'],
      ['www', 'CNAME', 'cname.vercel-dns.com'],
      ['portal', 'CNAME', 'cname.vercel-dns.com'],
    ],
    note: null,
    statusHosts: ['europetshospital.com', 'www.europetshospital.com', 'portal.europetshospital.com'],
  },
  {
    name: 'europetsclinic.com',
    tag: 'Secondary domain',
    registrar: '100WebSpace — registered 27 Sep 2026, Order #1122289 ($15.99/yr, PayPal).',
    registrarExpiry: '27 Sep 2027',
    dnsHost: "100WebSpace's own nameservers — the records already sitting in the 100WebSpace panel from earlier this session started working the moment the domain itself was registered.",
    serves: 'Same public marketing site as epc.vet and europetshospital.com. portal. subdomain also live.',
    records: [
      ['@', 'A', '76.76.21.21'],
      ['www', 'CNAME', 'cname.vercel-dns.com'],
      ['portal', 'CNAME', 'cname.vercel-dns.com'],
    ],
    note: null,
    statusHosts: ['europetsclinic.com', 'www.europetsclinic.com', 'portal.europetsclinic.com'],
  },
];

const SERVICES = [
  {
    name: 'Vercel — "website" project',
    lines: [
      'Domains: epc.vet, europetshospital.com, europetsclinic.com (+ www on each)',
      'Public marketing site, reviews, contact, new-patients, settle-bill',
    ],
  },
  {
    name: 'Vercel — "europets" project',
    lines: [
      'Domain: portal.epc.vet (+ fallback europets-chi.vercel.app)',
      'Practice-management app, client-app, one-off portal links',
    ],
  },
  {
    name: '100WebSpace',
    lines: [
      'Plan: Personal — expires 22 Jun 2027',
      'Hosts email (mbox.100ws.com) and DNS for europetshospital.com + europetsclinic.com',
      'Registered europetsclinic.com — 27 Sep 2026',
    ],
  },
  {
    name: 'Wix',
    lines: [
      'Was the real authoritative DNS for epc.vet — not anymore',
      'Not the domain registrar — confirmed "managed by third party"',
      'Premium Business Plan cancelled (auto-renew off) — stays active through Mar 2027, then ends',
    ],
  },
];

const RENEWALS = [
  ['epc.vet domain', 'eNom / domain.com', '30 May 2027'],
  ['europetsclinic.com domain', '100WebSpace', '27 Sep 2027'],
  ['100WebSpace hosting plan', '100WebSpace (Personal plan)', '22 Jun 2027'],
  ['europetshospital.com domain', '100WebSpace', 'Not yet confirmed'],
  ['Wix Premium plan (cancelled)', 'Wix', 'Ends 19 Mar 2027 — no renewal'],
];

const FOLLOW_UPS = [
  ['Confirm europetshospital.com’s exact renewal date', 'Check 100WebSpace’s Registered Domains list directly.'],
  ['Set STAFF_LOGIN_OTP_ENABLED / STAFF_LOGIN_OTP_PHONE live on Vercel', 'Still pending before staff OTP login can go live in production.'],
];

function domainPill(domain, statusByHost) {
  const rows = domain.statusHosts.map((h) => statusByHost[h]).filter(Boolean);
  if (rows.length === 0) return { label: 'Checking…', cls: 'void' };
  if (rows.every((r) => r.resolved && r.ok)) return { label: 'Live', cls: 'paid' };
  if (rows.some((r) => !r.resolved)) return { label: 'Not resolving', cls: 'unpaid' };
  return { label: 'Resolving, but drifted from expected', cls: 'partial' };
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <button
      type="button"
      className="button-link button-link-open"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked — nothing to fall back to here */
        }
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function WebsiteAccountingPage() {
  const [status, setStatus] = useState(null);
  const [logins, setLogins] = useState(null);
  const [revealed, setRevealed] = useState({});

  useEffect(() => {
    fetch('/api/accounting/website-status')
      .then((res) => res.json())
      .then((data) => setStatus(data));
    fetch('/api/accounting/website-credentials')
      .then((res) => res.json())
      .then((data) => setLogins(data.logins));
  }, []);

  const statusByHost = {};
  for (const r of status?.results || []) statusByHost[r.host] = r;

  return (
    <div>
      <div className="page-header">
        <h1>Website &amp; Domains</h1>
        <a href="/accounting" className="button-link">
          ← Accounting
        </a>
      </div>
      <p className="accounting-stat-hint">
        Every domain, DNS record, hosting account, and login behind epc.vet — domain status below is checked live on
        every load, not hand-maintained.
        {status && (
          <> Last checked {new Date(status.checked_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.</>
        )}
      </p>

      <div className="accounting-stat" style={{ marginBottom: '2rem', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <span className="accounting-stat-label">Want something on the site changed?</span>
          <span style={{ display: 'block', fontSize: '0.85rem', marginTop: '0.3rem' }}>
            Describe it in plain language — it'll show you a preview and wait for your go-ahead before anything goes live.
            Limited to the website only; can't touch patient records, invoices, or anything else in the app.
          </span>
        </div>
        <a
          href="https://claude.ai/code/session_01K3UCW1CRXkcCws6LWf4Ezi"
          target="_blank"
          rel="noopener noreferrer"
          className="button-link"
          style={{ flex: 'none' }}
        >
          💬 Request a website change
        </a>
      </div>

      <h2>Domains</h2>
      {DOMAINS.map((d) => {
        const pill = domainPill(d, statusByHost);
        return (
          <div key={d.name} style={{ background: 'white', border: '1px solid #eee', borderRadius: 8, padding: '1.25rem 1.5rem', marginBottom: '1rem' }}>
            <div className="page-header" style={{ marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontFamily: 'monospace', fontSize: '1.05rem' }}>{d.name}</h3>
              <span className={`status-pill ${pill.cls}`}>{pill.label}</span>
            </div>
            <p style={{ margin: '0 0 0.5rem' }}>
              <strong>Registrar:</strong> {d.registrar}
              {d.registrarExpiry !== '—' && <> — expires <strong>{d.registrarExpiry}</strong></>}
            </p>
            <p style={{ margin: '0 0 0.5rem' }}>
              <strong>DNS host:</strong> {d.dnsHost}
            </p>
            {d.serves && (
              <p style={{ margin: '0 0 0.75rem' }}>
                <strong>Serves:</strong> {d.serves}
              </p>
            )}
            {d.records.length > 0 && (
              <table style={{ fontSize: '0.85rem', marginTop: 0 }}>
                <thead>
                  <tr>
                    <th>Host</th>
                    <th>Type</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {d.records.map(([host, type, value]) => (
                    <tr key={`${host}-${type}`}>
                      <td>{host}</td>
                      <td>{type}</td>
                      <td>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {d.note && (
              <p className="accounting-stat-hint" style={{ marginTop: '0.75rem' }}>
                {d.note}
              </p>
            )}
          </div>
        );
      })}

      <h2>Logins</h2>
      <p className="accounting-stat-hint">Passwords are only ever shown here, behind the accounting password — never in a document or chat.</p>
      <div className="accounting-stat-grid">
        {(logins || []).map((l) => (
          <div key={l.id} className="accounting-stat" style={{ alignItems: 'flex-start' }}>
            <span className="accounting-stat-label">
              <a href={l.url} target="_blank" rel="noopener noreferrer">
                {l.service}
              </a>
            </span>
            {l.username && <span style={{ fontSize: '0.85rem' }}>{l.username}</span>}
            {l.password ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'monospace' }}>
                {revealed[l.id] ? l.password : '••••••••••'}
                <button
                  type="button"
                  className="button-link button-link-open"
                  onClick={() => setRevealed((r) => ({ ...r, [l.id]: !r[l.id] }))}
                >
                  {revealed[l.id] ? 'Hide' : 'Show'}
                </button>
                <CopyButton text={l.password} />
              </span>
            ) : (
              <span className="accounting-stat-hint">Not set yet</span>
            )}
            {l.note && <span className="accounting-stat-hint">{l.note}</span>}
          </div>
        ))}
        {!logins && <p>Loading…</p>}
      </div>

      <h2>Hosting &amp; services</h2>
      <div className="accounting-stat-grid">
        {SERVICES.map((s) => (
          <div key={s.name} className="accounting-stat" style={{ alignItems: 'flex-start' }}>
            <span className="accounting-stat-label">{s.name}</span>
            {s.lines.map((line) => (
              <span key={line} style={{ fontSize: '0.85rem' }}>
                {line}
              </span>
            ))}
          </div>
        ))}
      </div>

      <h2>Renewals to watch</h2>
      <table>
        <thead>
          <tr>
            <th>What</th>
            <th>Where</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {RENEWALS.map(([what, where, date]) => (
            <tr key={what}>
              <td>{what}</td>
              <td>{where}</td>
              <td>{date}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Open follow-ups</h2>
      <ul>
        {FOLLOW_UPS.map(([title, body]) => (
          <li key={title} style={{ marginBottom: '0.5rem' }}>
            <strong>{title}</strong> — {body}
          </li>
        ))}
      </ul>
    </div>
  );
}
