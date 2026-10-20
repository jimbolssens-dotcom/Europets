// app/(admin)/social/[id]/page.jsx
// One social post (migration 202): the AI's draft from the staff photos
// (lib/socialDraft.js), which staff can edit, re-order the cover of, leave
// photos out of, redo or approve. The cover photo carries a short headline
// the AI wrote (lib/socialCover.js), shown live on the cover's thumbnail
// while staff edit it. Once approved, and until Meta is
// connected (lib/metaSocial.js, app/(admin)/social/connect) an approved
// post goes out now or at a set time; otherwise it's posted by hand: copy
// the caption, share or download the files, then mark it as posted.

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

const CONSENT_CHIP = {
  yes: { label: '✓ Owner said yes', className: 'social-consent-yes' },
  no: { label: '✕ Owner said no', className: 'social-consent-no' },
  not_asked: { label: 'Owner not asked yet', className: 'social-consent-not_asked' },
};

function formatWhen(iso) {
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' });
}

async function fileFromUrl(url, name, fallbackType) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || fallbackType });
}

export default function SocialPostPage() {
  const { id } = useParams();
  const router = useRouter();
  const [post, setPost] = useState(null);
  const [error, setError] = useState(null);
  const [network, setNetwork] = useState('instagram');
  const [captions, setCaptions] = useState({ instagram: '', facebook: '' });
  const [staff, setStaff] = useState([]);
  const [staffId, setStaffId] = useState('');
  const [busy, setBusy] = useState(null);
  const [copied, setCopied] = useState(null);
  const [conn, setConn] = useState(null);
  const [targets, setTargets] = useState({ instagram: true, facebook: true });
  const [laterAt, setLaterAt] = useState('');
  const [headline, setHeadline] = useState('');
  // What the cover preview was last drawn with: follows the field after a
  // short pause, so it isn't redrawn on every key.
  const [shownHeadline, setShownHeadline] = useState('');

  function apply(data) {
    setPost(data);
    setCaptions({ instagram: data.caption_instagram || '', facebook: data.caption_facebook || '' });
    setHeadline(data.cover_headline || '');
    setShownHeadline(data.cover_headline || '');
  }

  useEffect(() => {
    const t = setTimeout(() => setShownHeadline(headline), 700);
    return () => clearTimeout(t);
  }, [headline]);

  useEffect(() => {
    fetch(`/api/social-posts/${id}`)
      .then((res) => res.json())
      .then((d) => (d.error ? setError(d.error) : apply(d)))
      .catch(() => setError('Could not load this post.'));
    fetch('/api/staff')
      .then((res) => res.json())
      .then((d) => setStaff(Array.isArray(d) ? d.filter((s) => s.active !== false) : []))
      .catch(() => {});
    try {
      setStaffId(localStorage.getItem('social_staff_id') || '');
    } catch {}
    fetch('/api/social-posts/connection')
      .then((res) => res.json())
      .then(setConn)
      .catch(() => setConn({ ok: false }));
  }, [id]);

  async function patch(body, label) {
    setBusy(label);
    setError(null);
    const res = await fetch(`/api/social-posts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(data.error || 'Something went wrong.');
      return null;
    }
    apply(data);
    return data;
  }

  const editable = post && (post.status === 'draft' || post.status === 'new');
  const edits = () => ({ caption_instagram: captions.instagram, caption_facebook: captions.facebook, cover_headline: headline });

  function setCover(i) {
    if (!editable || post.media[i].excluded) return;
    patch({ ...edits(), cover_index: i }, 'cover');
  }

  function toggleExcluded(i) {
    const media = post.media.map((m, j) => (j === i ? { ...m, excluded: !m.excluded, note: m.excluded ? null : 'Left out by staff' } : m));
    let cover = post.cover_index;
    if (media[cover]?.excluded) cover = Math.max(0, media.findIndex((m) => !m.excluded));
    patch({ ...edits(), media, cover_index: cover }, 'media');
  }

  async function redo() {
    const edited =
      captions.instagram !== (post.ai_caption_instagram || '') ||
      captions.facebook !== (post.ai_caption_facebook || '') ||
      headline !== (post.ai_cover_headline || '');
    if (edited && !confirm('Write a new draft? Your edits to this one will be replaced.')) return;
    setBusy('redo');
    setError(null);
    const res = await fetch(`/api/social-posts/${id}/draft`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || 'The AI could not write this one.');
    const fresh = await fetch(`/api/social-posts/${id}`).then((r) => r.json());
    setBusy(null);
    if (!fresh.error) apply(fresh);
  }

  async function approve() {
    try {
      localStorage.setItem('social_staff_id', staffId);
    } catch {}
    await patch({ ...edits(), action: 'approve', staff_id: staffId || null }, 'approve');
  }

  async function discard() {
    if (!confirm('Discard this post? It goes off the list.')) return;
    const data = await patch({ action: 'discard' }, 'discard');
    if (data) router.push('/social');
  }

  async function copy(which) {
    try {
      await navigator.clipboard.writeText(captions[which]);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Could not copy. Select the caption and copy it by hand.');
    }
  }

  const usable = post ? post.media.map((m, i) => ({ ...m, i })).filter((m) => !m.excluded) : [];
  const ordered = post ? [...usable.filter((m) => m.i === post.cover_index), ...usable.filter((m) => m.i !== post.cover_index)] : [];

  // On a phone, the share sheet (with the files) goes straight into the
  // Instagram or Facebook app. Elsewhere, download them one by one.
  async function shareFiles() {
    setBusy('share');
    setError(null);
    try {
      const files = await Promise.all(
        ordered.map((m, n) => fileFromUrl(m.url, m.name || `europets-${n + 1}${m.kind === 'video' ? '.mp4' : '.jpg'}`, m.kind === 'video' ? 'video/mp4' : 'image/jpeg'))
      );
      if (navigator.canShare && navigator.canShare({ files })) {
        await navigator.clipboard.writeText(captions[network]).catch(() => {});
        await navigator.share({ files });
      } else {
        for (const f of files) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(f);
          a.download = f.name;
          a.click();
          URL.revokeObjectURL(a.href);
        }
      }
    } catch (err) {
      if (err?.name !== 'AbortError') setError('Could not get the files ready. Try again, or download them one by one.');
    }
    setBusy(null);
  }

  // "Later" is typed in clinic time (UAE, UTC+4) whatever the phone's own
  // time zone.
  async function publish(when) {
    const body = {
      targets: Object.keys(targets).filter((t) => targets[t]),
      when: when === 'now' ? 'now' : `${laterAt}:00+04:00`,
    };
    setBusy('publish');
    setError(null);
    const res = await fetch(`/api/social-posts/${id}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || 'Could not post.');
    const fresh = await fetch(`/api/social-posts/${id}`).then((r) => r.json());
    setBusy(null);
    if (!fresh.error) apply(fresh);
  }

  if (error && !post) return <p className="error">{error}</p>;
  if (!post) return <p className="visit-meta">Loading...</p>;

  const chip = CONSENT_CHIP[post.consent];
  const coverItem = post.media[post.cover_index];
  const coverIsPhoto = coverItem && !coverItem.excluded && coverItem.kind === 'image';
  const coverUrl = (h) => `/api/social-posts/${id}/cover?i=${post.cover_index}&h=${encodeURIComponent(h)}`;
  const processing = post.publish_state?.instagram?.status === 'processing' && !post.publish_error;
  const scheduled = !!post.scheduled_for && !post.publish_error && new Date(post.scheduled_for).getTime() > Date.now() - 60 * 1000;

  const byHand = (
    <div className="social-steps">
      <ol>
        <li>
          <button type="button" className="secondary" onClick={() => copy(network)}>
            {copied === network ? '✓ Copied' : `📋 Copy ${network === 'instagram' ? 'Instagram' : 'Facebook'} caption`}
          </button>
        </li>
        <li>
          <button type="button" className="secondary" onClick={shareFiles} disabled={!!busy}>
            {busy === 'share' ? 'Getting files...' : `📤 Share ${ordered.length} file${ordered.length === 1 ? '' : 's'}`}
          </button>{' '}
          <span className="visit-meta">Pick Instagram or Facebook, paste the caption, then mark it as posted.</span>
        </li>
      </ol>
      {conn?.ok && (
        <button type="button" className="social-link-button" onClick={() => patch({ action: 'posted' }, 'posted')} disabled={!!busy}>
          ✓ Mark as posted
        </button>
      )}
    </div>
  );

  return (
    <div className="social-page">
      <div className="page-header">
        <h1>{post.title || 'New post'}</h1>
        <div className="page-header-actions">
          <a href="/social" className="button-link social-ghost">‹ Social</a>
        </div>
      </div>

      <div className="card social-card social-draft">
        <div className="social-media-strip">
          {post.media.map((m, i) => (
            <figure key={m.path} className={`social-media${i === post.cover_index ? ' social-media-cover' : ''}${m.excluded ? ' social-media-out' : ''}`}>
              <button type="button" className="social-media-pick" onClick={() => setCover(i)} disabled={!editable} title={editable ? 'Use as the cover' : undefined}>
                {m.kind === 'video' ? (
                  <video src={m.url} poster={m.preview_path ? m.preview_url : undefined} muted playsInline controls={!editable} />
                ) : (
                  <img src={i === post.cover_index && shownHeadline.trim() ? coverUrl(shownHeadline) : m.preview_url} alt="" />
                )}
              </button>
              <figcaption>
                {i === post.cover_index && !m.excluded && <span className="social-chip social-chip-pink">Cover</span>}
                {m.kind === 'video' && <span className="social-chip">▶ video</span>}
                {editable && (
                  <button type="button" className="social-link-button" onClick={() => toggleExcluded(i)} disabled={!!busy}>
                    {m.excluded ? 'Use it' : 'Leave out'}
                  </button>
                )}
              </figcaption>
              {m.excluded && m.note && <div className="social-media-note">{m.note}</div>}
            </figure>
          ))}
        </div>

        {coverIsPhoto && (editable || headline) && (
          <div className="social-headline">
            <label className="social-headline-field">
              <span className="social-field-label">
                Text on the cover{' '}
                <a href={coverUrl(headline)} target="_blank" rel="noopener noreferrer" className="visit-meta social-headline-view">
                  🔍 View
                </a>
              </span>
              <input
                type="text"
                value={headline}
                maxLength={60}
                onChange={(e) => setHeadline(e.target.value)}
                readOnly={!editable}
                placeholder="No text: the photo goes out as it is"
              />
            </label>
            {editable && headline && (
              <button type="button" className="social-link-button" onClick={() => setHeadline('')}>
                No text
              </button>
            )}
            {editable && !headline && post.ai_cover_headline && (
              <button type="button" className="social-link-button" onClick={() => setHeadline(post.ai_cover_headline)}>
                Use the AI&apos;s
              </button>
            )}
          </div>
        )}

        {post.ai_notes && <div className="social-ai">✨ {post.ai_notes}</div>}
        {post.ai_error && !post.caption_instagram && <p className="error">The AI couldn&apos;t write this one yet. Tap ↻ Redo to try again.</p>}

        <div className="social-seg" role="tablist">
          {['instagram', 'facebook'].map((n) => (
            <button key={n} type="button" role="tab" aria-selected={network === n} className={network === n ? 'social-seg-on' : ''} onClick={() => setNetwork(n)}>
              {n === 'instagram' ? 'Instagram' : 'Facebook'}
            </button>
          ))}
        </div>
        <textarea
          className="social-caption"
          rows={9}
          value={captions[network]}
          onChange={(e) => setCaptions({ ...captions, [network]: e.target.value })}
          readOnly={!editable}
        />

        <div className="social-inline">
          {chip && (
            post.client_id
              ? <a href={`/clients/${post.client_id}`} className={`social-chip ${chip.className}`}>{chip.label}</a>
              : <span className={`social-chip ${chip.className}`}>{chip.label}</span>
          )}
          {post.patients?.name && <span className="social-chip">🐾 {post.patients.name}</span>}
          {post.created_by_name && <span className="social-chip">by {post.created_by_name}</span>}
          {post.approved_by_name && <span className="social-chip">✓ {post.approved_by_name}</span>}
        </div>
        {post.story && <p className="visit-meta">“{post.story}”</p>}
        {error && <p className="error">{error}</p>}

        {editable && (
          <>
            {post.blocker && <p className="social-hint">{post.blocker}</p>}
            <div className="social-actions">
              <select value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-label="Approved by" className="social-approver">
                <option value="">Approved by...</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
              <button type="button" className="social-primary" onClick={approve} disabled={!!busy || !!post.blocker || !staffId}>
                {busy === 'approve' ? 'Approving...' : '✓ Approve'}
              </button>
              <button type="button" className="secondary" onClick={redo} disabled={!!busy}>
                {busy === 'redo' ? '✨ Writing...' : '↻ Redo'}
              </button>
              <button type="button" className="secondary" onClick={discard} disabled={!!busy}>
                Discard
              </button>
            </div>
            <p className="visit-meta">Edit the caption and the cover text right here. What you approve teaches the AI how we sound.</p>
          </>
        )}

        {post.status === 'approved' && (
          <>
            {conn?.ok ? (
              <div className="social-publish">
                {post.publish_error && (
                  <p className="error">Couldn&apos;t post: {post.publish_error}</p>
                )}
                {processing ? (
                  <p className="social-hint">⏳ Instagram is still processing the video. It goes out by itself within a few minutes.{post.publish_state?.facebook?.status === 'done' ? ' Facebook is already done.' : ''}</p>
                ) : scheduled ? (
                  <div className="social-inline">
                    <span className="social-chip social-chip-pink">📅 {formatWhen(post.scheduled_for)}</span>
                    <span className="visit-meta">{(post.publish_targets || []).map((t) => (t === 'instagram' ? 'Instagram' : 'Facebook')).join(' + ')}</span>
                    <button type="button" className="social-link-button" onClick={() => patch({ action: 'unschedule' }, 'unschedule')} disabled={!!busy}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="social-inline">
                      <label className="social-check">
                        <input type="checkbox" checked={targets.instagram} onChange={(e) => setTargets({ ...targets, instagram: e.target.checked })} />
                        Instagram
                      </label>
                      <label className="social-check">
                        <input type="checkbox" checked={targets.facebook} onChange={(e) => setTargets({ ...targets, facebook: e.target.checked })} />
                        Facebook
                      </label>
                    </div>
                    <div className="social-actions">
                      <button type="button" className="social-primary" onClick={() => publish('now')} disabled={!!busy || (!targets.instagram && !targets.facebook)}>
                        {busy === 'publish' ? 'Posting...' : post.publish_error ? '↻ Try again now' : '📤 Post now'}
                      </button>
                      <span className="social-later">
                        <input
                          type="datetime-local"
                          className="social-when"
                          value={laterAt}
                          onChange={(e) => setLaterAt(e.target.value)}
                          aria-label="Post later at"
                        />
                        <button type="button" className="secondary" onClick={() => publish('later')} disabled={!!busy || !laterAt || (!targets.instagram && !targets.facebook)}>
                          📅 Schedule
                        </button>
                      </span>
                    </div>
                  </>
                )}
                <div className="social-inline">
                  <button type="button" className="social-link-button" onClick={() => patch({ action: 'reopen' }, 'reopen')} disabled={!!busy || processing}>
                    ✎ Edit again
                  </button>
                  <details className="social-by-hand">
                    <summary>Post by hand instead</summary>
                    {byHand}
                  </details>
                </div>
              </div>
            ) : (
              <>
                {byHand}
                <p className="visit-meta">
                  {conn ? <><a href="/social/connect">Connect Instagram and Facebook</a> and approved posts go out by themselves.</> : 'Checking the Instagram and Facebook connection...'}
                </p>
                <div className="social-actions">
                  <button type="button" className="social-primary" onClick={() => patch({ action: 'posted' }, 'posted')} disabled={!!busy}>
                    ✓ Mark as posted
                  </button>
                  <button type="button" className="secondary" onClick={() => patch({ action: 'reopen' }, 'reopen')} disabled={!!busy}>
                    ✎ Edit again
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {post.status === 'posted' && (
          <div className="social-inline">
            <span className="social-chip social-consent-yes">
              ✓ Posted {new Date(post.posted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' })}
            </span>
            {post.publish_state?.instagram?.permalink && <a href={post.publish_state.instagram.permalink} target="_blank" rel="noopener noreferrer">See it on Instagram</a>}
            {post.publish_state?.facebook?.permalink && <a href={post.publish_state.facebook.permalink} target="_blank" rel="noopener noreferrer">See it on Facebook</a>}
          </div>
        )}
      </div>
    </div>
  );
}
