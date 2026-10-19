// app/(admin)/social/[id]/page.jsx
// One social post (migration 202): the AI's draft from the staff photos
// (lib/socialDraft.js), which staff can edit, re-order the cover of, leave
// photos out of, redo or approve. Once approved, and until Meta is
// connected, it's posted by hand: copy the caption, share or download the
// files, then mark it as posted.

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

const CONSENT_CHIP = {
  yes: { label: '✓ Owner said yes', className: 'social-consent-yes' },
  no: { label: '✕ Owner said no', className: 'social-consent-no' },
  not_asked: { label: 'Owner not asked yet', className: 'social-consent-not_asked' },
};

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

  function apply(data) {
    setPost(data);
    setCaptions({ instagram: data.caption_instagram || '', facebook: data.caption_facebook || '' });
  }

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
  const edits = () => ({ caption_instagram: captions.instagram, caption_facebook: captions.facebook });

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
    const edited = captions.instagram !== (post.ai_caption_instagram || '') || captions.facebook !== (post.ai_caption_facebook || '');
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

  if (error && !post) return <p className="error">{error}</p>;
  if (!post) return <p className="visit-meta">Loading...</p>;

  const chip = CONSENT_CHIP[post.consent];

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
                {m.kind === 'video' ? <video src={m.url} poster={m.preview_path ? m.preview_url : undefined} muted playsInline controls={!editable} /> : <img src={m.preview_url} alt="" />}
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
            <p className="visit-meta">Edit the caption right in the box. What you approve teaches the AI how we sound.</p>
          </>
        )}

        {post.status === 'approved' && (
          <>
            <div className="social-steps">
              <strong>Post it</strong> <span className="visit-meta">(by hand until Instagram and Facebook are connected)</span>
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
                  <span className="visit-meta">Pick Instagram or Facebook, paste the caption.</span>
                </li>
              </ol>
            </div>
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

        {post.status === 'posted' && (
          <p className="visit-meta">
            ✓ Posted {new Date(post.posted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' })}
          </p>
        )}
      </div>
    </div>
  );
}
