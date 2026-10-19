// app/(admin)/social/page.jsx
// The Social page (migration 202): posts the AI drafted from staff photos,
// waiting for a staff member to approve them; approved ones waiting to be
// posted (by hand until Meta is connected); and what's been posted.

'use client';

import { useEffect, useState } from 'react';

const TABS = [
  { key: 'draft', label: 'To approve' },
  { key: 'approved', label: 'To post' },
  { key: 'posted', label: 'Posted' },
];

const CONSENT_CHIP = {
  yes: { label: '✓ Owner said yes', className: 'social-consent-yes' },
  no: { label: '✕ Owner said no', className: 'social-consent-no' },
  not_asked: { label: 'Owner not asked', className: 'social-consent-not_asked' },
};

function when(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' });
}

function mediaLabel(p) {
  return [
    p.photo_count && `${p.photo_count} photo${p.photo_count === 1 ? '' : 's'}`,
    p.video_count && `${p.video_count} video${p.video_count === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' + ');
}

export default function SocialPage() {
  const [tab, setTab] = useState('draft');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    fetch(`/api/social-posts?status=${tab}`)
      .then((res) => res.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch(() => setError('Could not load the posts.'));
  }, [tab]);

  const counts = data?.counts || {};

  return (
    <div className="social-page">
      <div className="page-header">
        <h1>📸 Social</h1>
        <div className="page-header-actions">
          <a href="/social/new" className="button-link">＋ Upload</a>
        </div>
      </div>

      <div className="social-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`social-tab${tab === t.key ? ' social-tab-on' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.key !== 'posted' && counts[t.key] ? ` ${counts[t.key]}` : ''}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="visit-meta">Loading...</p>}
      {data && data.posts.length === 0 && (
        <div className="card social-card social-empty">
          {tab === 'draft' && (
            <>
              <p><strong>Nothing waiting.</strong> Upload a few photos or a short clip from today and the AI writes the post.</p>
              <p className="visit-meta">Good ones: a pet going home, a calm moment in the ward or cattery, the team at work, a happy check-up.</p>
            </>
          )}
          {tab === 'approved' && <p>Nothing waiting to be posted.</p>}
          {tab === 'posted' && <p>Nothing posted from here yet.</p>}
        </div>
      )}

      <div className="social-list">
        {data?.posts.map((p) => {
          const chip = CONSENT_CHIP[p.consent];
          return (
            <a key={p.id} href={`/social/${p.id}`} className="card social-card social-item">
              <div className="social-item-thumb">
                {p.cover_url ? <img src={p.cover_url} alt="" /> : <span>{mediaLabel(p) || 'no files'}</span>}
              </div>
              <div className="social-item-body">
                <div className="social-item-title">{p.title || p.story || (p.status === 'new' ? 'Being written...' : 'Untitled')}</div>
                <div className="visit-meta">
                  {[p.created_by_name && `by ${p.created_by_name}`, when(tab === 'posted' ? p.posted_at : tab === 'approved' ? p.approved_at : p.created_at)].filter(Boolean).join(' · ')}
                </div>
                <div className="social-inline">
                  {chip && <span className={`social-chip ${chip.className}`}>{chip.label}</span>}
                  {p.patient_name && <span className="social-chip">🐾 {p.patient_name}</span>}
                  {mediaLabel(p) && <span className="social-chip">{mediaLabel(p)}</span>}
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
