// app/(admin)/social/connect/page.jsx
// Connecting the Social page to the clinic's Facebook Page and Instagram
// (lib/metaSocial.js): the one-time steps in Meta, and a live check of what
// the app can reach right now (app/api/social-posts/connection).

'use client';

import { useEffect, useState } from 'react';

const PERMISSION_LABELS = {
  pages_show_list: 'pages_show_list',
  pages_read_engagement: 'pages_read_engagement',
  pages_manage_posts: 'pages_manage_posts',
  instagram_basic: 'instagram_basic',
  instagram_content_publish: 'instagram_content_publish',
};

export default function SocialConnectPage() {
  const [conn, setConn] = useState(null);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    const data = await fetch('/api/social-posts/connection').then((r) => r.json()).catch(() => ({ ok: false, reason: 'Could not reach the app.' }));
    setConn(data);
    setChecking(false);
  }

  useEffect(() => {
    check();
  }, []);

  return (
    <div className="social-page">
      <div className="page-header">
        <h1>Connect Instagram &amp; Facebook</h1>
        <div className="page-header-actions">
          <a href="/social" className="button-link social-ghost">‹ Social</a>
        </div>
      </div>

      <div className="card social-card social-connect">
        <div className="social-inline">
          {!conn && <span className="social-chip">Checking...</span>}
          {conn?.ok && <span className="social-chip social-consent-yes">✓ Connected</span>}
          {conn && !conn.ok && <span className="social-chip social-consent-not_asked">Not connected yet</span>}
          {conn?.page && <span className="social-chip">Facebook: {conn.page.name}</span>}
          {conn?.instagram && <span className="social-chip">Instagram: @{conn.instagram.username}</span>}
          <button type="button" className="social-link-button" onClick={check} disabled={checking}>
            {checking ? 'Checking...' : '↻ Check again'}
          </button>
        </div>
        {conn && !conn.ok && conn.reason && <p className="social-hint">{conn.reason}</p>}
        {conn?.missing?.length > 0 && (
          <p className="visit-meta">
            Missing: {conn.missing.map((p) => <code key={p}>{PERMISSION_LABELS[p] || p}</code>).reduce((a, b) => [a, ', ', b])}
          </p>
        )}
        {conn?.pages?.length > 1 && (
          <p className="visit-meta">Pages the token sees: {conn.pages.map((p) => `${p.name} (${p.id})`).join(', ')}</p>
        )}
        {conn?.ok && <p>Approved posts can now go out by themselves, straight away or at a time you pick.</p>}
      </div>

      {!conn?.ok && (
        <div className="card social-card social-connect">
          <h2>The one-time setup in Meta</h2>
          <p className="visit-meta">About 10 minutes, on a laptop. It uses the same Meta business account as the clinic&apos;s WhatsApp.</p>
          <ol className="social-connect-steps">
            <li>
              Open <a href="https://business.facebook.com/settings" target="_blank" rel="noopener noreferrer">Meta Business settings</a>. Under
              <strong> Accounts → Pages</strong> check the Europets Facebook Page is there, and under <strong>Accounts → Instagram accounts</strong> that
              @europetsclinic is. Add whichever is missing.
            </li>
            <li>
              Go to <strong>Users → System users</strong>, pick the one the WhatsApp connection uses (or add a new Admin system user), then
              <strong> Assign assets</strong>: the Page with <em>Content</em> and <em>Community activity</em> access, and the Instagram account with
              <em> Content</em> access.
            </li>
            <li>
              Still on that system user, tap <strong>Generate new token</strong>, pick the clinic&apos;s app, set it to <strong>never expire</strong>, and tick:
              <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>pages_manage_posts</code>, <code>instagram_basic</code>,
              <code>instagram_content_publish</code> and <code>business_management</code>. If one isn&apos;t in the list, open the app on{' '}
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">developers.facebook.com</a> and add the
              <em> Manage everything on your Page</em> and <em>Manage messaging &amp; content on Instagram</em> use cases first.
            </li>
            <li>
              Copy the token and paste it into Vercel: project <strong>europets → Settings → Environment Variables</strong>, new variable
              <code>META_SOCIAL_ACCESS_TOKEN</code>, Production. Don&apos;t send the token in a chat. Then tell Claude it&apos;s saved, so the app is
              redeployed with it, and tap <strong>Check again</strong> here.
            </li>
          </ol>
          <p className="visit-meta">This is a new token next to the WhatsApp one: WhatsApp keeps working exactly as it does now.</p>
        </div>
      )}
    </div>
  );
}
