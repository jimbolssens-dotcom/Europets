// app/(admin)/social/[id]/page.jsx
// One social post (migration 202): the AI's draft from the staff photos
// (lib/socialDraft.js), which staff can edit, re-order the cover of, leave
// photos out of, redo or approve. The cover photo carries a short headline
// the AI wrote (lib/socialCover.js), shown live on the cover's thumbnail
// while staff edit it. It can go out as photos or as a Reel made from them
// and clips (lib/socialReel.js): a line of text per file, a backing track, made on
// the server in about half a minute and previewed here; or as a Story, each
// photo a full-screen frame with its text (lib/socialStory.js), previewed
// frame by frame. Each photo can be touched up (a look, what stays in
// frame, the pet's speech bubble, a sticker; app/_components/SocialTouchUp.jsx)
// and the captions and cover text remixed by the AI. Photos can open with
// a layout picture, a Before / After or a Collage (lib/socialLayoutPlan.js). Once approved, and until Meta is
// connected (lib/metaSocial.js, app/(admin)/social/connect) an approved
// post goes out now or at a set time; otherwise it's posted by hand: copy
// the caption, share or download the files, then mark it as posted.

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { REEL_MUSIC, reelItems, reelKey, reelTimeline, reelContents, preparedClip, storyItems } from '@/lib/socialReelPlan';
import { touchUpKey } from '@/lib/socialTouchUpPlan';
import { LAYOUTS, layoutItems, afterLayout, defaultLayoutItems } from '@/lib/socialLayoutPlan';
import { RemixButtons, RemixOptions, TouchUpPanel } from '@/app/_components/SocialTouchUp';

const CONSENT_CHIP = {
  yes: { label: '✓ Owner said yes', className: 'social-consent-yes' },
  no: { label: '✕ Owner said no', className: 'social-consent-no' },
  not_asked: { label: 'Owner not asked yet', className: 'social-consent-not_asked' },
};

function formatWhen(iso) {
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' });
}

// A short tag for a photo's touch-ups, so its preview is fetched again
// when they change.
function lookTag(item) {
  const key = touchUpKey(item);
  let h = 0;
  for (let k = 0; k < key.length; k++) h = (h * 31 + key.charCodeAt(k)) | 0;
  return key ? (h >>> 0).toString(36) : '';
}

// The layout picture's preview (app/api/social-posts/[id]/layout), fetched
// again when its photos' touch-ups change.
function layoutPreviewUrl(id, layout, headline, media) {
  const tags = layout.items.map((i) => lookTag(media[i] || {})).join('.');
  return `/api/social-posts/${id}/layout?kind=${layout.kind}&items=${layout.items.join(',')}&h=${encodeURIComponent(headline || '')}&v=${tags}`;
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
  const [postAs, setPostAs] = useState('photos');
  const [reelLines, setReelLines] = useState([]);
  const [music, setMusic] = useState('sunny');
  // What the Story frame previews were last drawn with (follows the text
  // fields after a short pause, like the cover preview).
  const [shownLines, setShownLines] = useState([]);
  // The photo being touched up (its media index), and the AI's three
  // versions of whichever text was last remixed ({ field, tone, options }).
  const [touching, setTouching] = useState(null);
  const [remix, setRemix] = useState(null);
  const [layout, setLayout] = useState(null);

  function apply(data) {
    setPost(data);
    setCaptions({ instagram: data.caption_instagram || '', facebook: data.caption_facebook || '' });
    setHeadline(data.cover_headline || '');
    setShownHeadline(data.cover_headline || '');
    setPostAs(data.post_as || 'photos');
    setReelLines(Array.isArray(data.reel_lines) ? data.reel_lines : []);
    setMusic(data.reel_music || 'sunny');
    setLayout(data.layout || null);
  }

  useEffect(() => {
    const t = setTimeout(() => setShownHeadline(headline), 700);
    return () => clearTimeout(t);
  }, [headline]);

  useEffect(() => {
    const t = setTimeout(() => setShownLines(reelLines), 700);
    return () => clearTimeout(t);
  }, [reelLines]);

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
  const edits = () => ({
    caption_instagram: captions.instagram,
    caption_facebook: captions.facebook,
    cover_headline: headline,
    post_as: postAs,
    reel_lines: reelLines,
    reel_music: music,
    layout,
  });

  function choosePostAs(next) {
    setPostAs(next);
    patch({ ...edits(), post_as: next }, 'post_as');
  }

  // A layout's photos are tapped in order (before, then after); tapping one
  // again takes it out. A full Before / After swaps its after photo.
  function chooseLayout(kind) {
    const next = kind ? { kind, items: layout?.kind === kind ? layout.items : defaultLayoutItems(post, kind) } : null;
    setLayout(next);
    patch({ ...edits(), layout: next }, 'layout');
  }

  function toggleLayoutPhoto(i) {
    const max = LAYOUTS.find((l) => l.key === layout.kind).max;
    let items = layout.items.includes(i) ? layout.items.filter((x) => x !== i) : [...layout.items, i];
    if (items.length > max) items = layout.kind === 'before_after' ? [items[0], i] : items.slice(0, max);
    const next = { ...layout, items };
    setLayout(next);
    patch({ ...edits(), layout: next }, 'layout');
  }

  function setReelLine(i, value) {
    setReelLines((prev) => {
      const nextLines = [...prev];
      nextLines[i] = value;
      return nextLines;
    });
  }

  async function makeReel() {
    setError(null);
    // Clips first, each in a call of its own and side by side (a phone's 4K
    // clip can take most of a minute); ones already done are kept.
    const clips = {};
    const toPrepare = reelItems(post).filter((i) => post.media[i].kind === 'video' && !preparedClip(post.media[i], id));
    if (toPrepare.length) {
      setBusy('clips');
      const results = await Promise.all(
        toPrepare.map((i) =>
          fetch(`/api/social-posts/${id}/reel/clip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index: i }),
          })
            .then(async (r) => ({ i, ok: r.ok, data: await r.json().catch(() => ({})) }))
            .catch(() => ({ i, ok: false, data: {} }))
        )
      );
      const failed = results.find((r) => !r.ok);
      if (failed) {
        setBusy(null);
        return setError(`${failed.data.error || "Couldn't get a video ready"}. Try again, or leave that video out.`);
      }
      for (const r of results) clips[r.i] = r.data;
    }
    setBusy('reel');
    const res = await fetch(`/api/social-posts/${id}/reel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cover_headline: headline, reel_lines: reelLines, reel_music: music, clips }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || "Couldn't make the Reel. Try again.");
    // Saves the caption edits too, and brings back the post with its Reel.
    await patch({ caption_instagram: captions.instagram, caption_facebook: captions.facebook }, 'reel');
  }

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

  async function remixText(field, tone, text, index) {
    setRemix({ field, tone, options: null });
    setError(null);
    const res = await fetch(`/api/social-posts/${id}/remix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, tone, text, index }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRemix(null);
      return setError(data.error || "The AI couldn't do that one. Try again.");
    }
    setRemix((prev) => (prev?.field === field ? { field, tone, options: data.options } : prev));
  }

  async function saveTouchUp(touchUps) {
    const media = post.media.map((m, j) => (j === touching ? { ...m, ...touchUps } : m));
    const saved = await patch({ ...edits(), media }, 'touchup');
    if (saved) setTouching(null);
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
      const laid = layoutItems({ ...post, post_as: postAs, layout });
      const toShare = laid ? afterLayout(post, laid).map((i) => ({ ...post.media[i], i })) : ordered;
      const files = await Promise.all(
        toShare.map((m, n) => fileFromUrl(m.url, m.name || `europets-${n + 1}${m.kind === 'video' ? '.mp4' : '.jpg'}`, m.kind === 'video' ? 'video/mp4' : 'image/jpeg'))
      );
      if (laid) files.unshift(await fileFromUrl(`${layoutPreviewUrl(id, layout, headline, post.media)}&full=1`, 'europets-layout.jpg', 'image/jpeg'));
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
  const reelOrder = reelItems(post);
  const storyOrder = storyItems(post);
  const storyFrameUrl = (i, k) =>
    `/api/social-posts/${id}/story-frame?i=${i}&first=${k === 0 ? 1 : 0}&t=${encodeURIComponent(k === 0 ? shownHeadline : shownLines[i] || '')}&v=${lookTag(post.media[i])}`;
  const reelDraft = { ...post, cover_headline: headline, reel_lines: reelLines, reel_music: music };
  const reelCurrent = !!post.reel && post.reel.key === reelKey(reelDraft);
  const photoChoices = post.media.map((m, i) => ({ ...m, i })).filter((m) => m.kind === 'image' && !m.excluded);
  const laidOut = layoutItems({ ...post, post_as: postAs, layout });
  const coverUrl = (h, i = post.cover_index) => `/api/social-posts/${id}/cover?i=${i}&h=${encodeURIComponent(h)}`;
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
                  <img src={(i === post.cover_index && shownHeadline.trim()) || lookTag(m) ? `${coverUrl(i === post.cover_index ? shownHeadline : '', i)}&v=${lookTag(m)}` : m.preview_url} alt="" />
                )}
              </button>
              {editable && m.kind === 'image' && !m.excluded && (
                <button type="button" className="social-media-edit" onClick={() => { setTouching(touching === i ? null : i); setRemix(null); }} disabled={!!busy}>
                  ✨ Edit
                </button>
              )}
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

        {editable && touching !== null && post.media[touching]?.kind === 'image' && (
          <TouchUpPanel
            key={touching}
            postId={id}
            index={touching}
            item={post.media[touching]}
            number={ordered.findIndex((m) => m.i === touching) + 1}
            headline={touching === post.cover_index ? shownHeadline : ''}
            busy={busy === 'touchup'}
            onSave={saveTouchUp}
            onCancel={() => { setTouching(null); setRemix(null); }}
            remix={remix?.field === 'bubble' ? remix : null}
            onRemix={(text) => remixText('bubble', null, text, touching)}
            onCloseRemix={() => setRemix(null)}
          />
        )}

        {(coverIsPhoto || laidOut) && (editable || headline) && (
          <div className="social-headline">
            <label className="social-headline-field">
              <span className="social-field-label">
                {laidOut ? 'Text on the layout' : 'Text on the cover'}{' '}
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
            {editable && (
              <button type="button" className="social-chip-button" onClick={() => remixText('cover_headline', null, headline)} disabled={remix?.field === 'cover_headline' && !remix.options}>
                {remix?.field === 'cover_headline' && !remix.options ? '✨ ...' : '💡 Ideas'}
              </button>
            )}
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

        {remix?.field === 'cover_headline' && (
          <RemixOptions remix={remix} onPick={(o) => { setHeadline(o); setRemix(null); }} onClose={() => setRemix(null)} />
        )}

        {reelOrder.length > 0 && (editable || postAs !== 'photos') && (
          <div className="social-reel">
            <div className="social-reel-head">
              <span className="social-field-label">Post as</span>
              <div className="social-seg social-seg-small" role="tablist">
                {[
                  ['photos', '📷 Photos'],
                  ['reel', '🎬 Reel'],
                  ['story', '📖 Story'],
                ].map(([key, label]) => (
                  <button key={key} type="button" role="tab" aria-selected={postAs === key} className={postAs === key ? 'social-seg-on' : ''} onClick={() => editable && postAs !== key && choosePostAs(key)} disabled={!editable || !!busy}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {postAs === 'photos' && photoChoices.length >= 2 && (editable || layout) && (
              <div className="social-layout">
                <div className="social-reel-head">
                  <span className="social-field-label">Layout</span>
                  <div className="social-seg social-seg-small" role="tablist">
                    {[{ key: null, label: 'Single' }, ...LAYOUTS].map((l) => (
                      <button key={l.key || 'none'} type="button" role="tab" aria-selected={(layout?.kind || null) === l.key} className={(layout?.kind || null) === l.key ? 'social-seg-on' : ''} onClick={() => editable && (layout?.kind || null) !== l.key && chooseLayout(l.key)} disabled={!editable || !!busy}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
                {layout && (
                  <div className="social-layout-pair">
                    {laidOut ? (
                      <a href={`${layoutPreviewUrl(id, layout, shownHeadline, post.media)}&full=1`} target="_blank" rel="noopener noreferrer" className="social-layout-preview">
                        <img src={layoutPreviewUrl(id, layout, shownHeadline, post.media)} alt="The layout picture" />
                      </a>
                    ) : (
                      <div className="social-layout-preview social-layout-empty">{layout.kind === 'before_after' ? 'Pick 2 photos' : 'Pick 2 to 4 photos'}</div>
                    )}
                    <div className="social-layout-side">
                      <span className="visit-meta">
                        {layout.kind === 'before_after' ? 'Tap the before photo, then the after.' : 'Tap 2 to 4 photos, in order.'} It goes first{afterLayout(post, laidOut || []).length ? ', then the other photos' : ''}.
                      </span>
                      <div className="social-layout-picks">
                        {photoChoices.map((m) => {
                          const n = layout.items.indexOf(m.i);
                          return (
                            <button key={m.path} type="button" className={`social-layout-pick${n >= 0 ? ' social-layout-pick-on' : ''}`} onClick={() => toggleLayoutPhoto(m.i)} disabled={!editable || !!busy} aria-pressed={n >= 0}>
                              <img src={m.preview_url} alt="" />
                              {n >= 0 && <span>{layout.kind === 'before_after' ? (n === 0 ? 'Before' : 'After') : n + 1}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {postAs === 'reel' && (
              <>
                {reelOrder.length > 1 && (
                  <div className="social-reel-lines">
                    {reelOrder.slice(1).map((i) => (
                      <label key={post.media[i].path} className="social-reel-line">
                        {post.media[i].kind === 'video' && !post.media[i].preview_path ? (
                          <span className="social-reel-line-video">▶</span>
                        ) : (
                          <span className="social-reel-line-thumb">
                            <img src={post.media[i].preview_url} alt="" />
                            {post.media[i].kind === 'video' && <span className="social-reel-line-play">▶</span>}
                          </span>
                        )}
                        <input
                          type="text"
                          value={reelLines[i] || ''}
                          maxLength={60}
                          onChange={(e) => setReelLine(i, e.target.value)}
                          readOnly={!editable}
                          placeholder="No text on this photo"
                        />
                      </label>
                    ))}
                  </div>
                )}
                <div className="social-reel-music" role="group" aria-label="Music">
                  <span aria-hidden="true">🎵</span>
                  {REEL_MUSIC.map((m) => (
                    <button key={m.key} type="button" className={`social-chip-button${music === m.key ? ' social-chip-on' : ''}`} onClick={() => setMusic(m.key)} disabled={!editable || !!busy} title={m.title} aria-label={m.title || m.label}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="social-reel-made">
                  {post.reel?.url && (
                    <div className="social-reel-preview">
                      {/* #t=0.1 makes phones show the first frame before it plays. */}
                      <video key={post.reel.url} src={`${post.reel.url}#t=0.1`} controls playsInline preload="metadata" />
                    </div>
                  )}
                  <div className="social-reel-side">
                    {post.reel && !reelCurrent && <span className="social-chip social-consent-not_asked">Out of date</span>}
                    {editable && (
                      <button type="button" className={reelCurrent ? 'secondary' : 'social-primary'} onClick={makeReel} disabled={!!busy}>
                        {busy === 'clips' ? '🎬 Getting the videos ready...' : busy === 'reel' ? '🎬 Making it...' : post.reel ? (reelCurrent ? '↻ Make it again' : '🎬 Make it again') : '🎬 Make the Reel'}
                      </button>
                    )}
                    <span className="visit-meta">
                      {busy === 'clips' || busy === 'reel'
                        ? 'About half a minute. Keep this page open.'
                        : `${reelContents(post, reelOrder)}, ${post.reel && reelCurrent ? '' : 'about '}${Math.round(post.reel && reelCurrent ? post.reel.duration : reelTimeline(reelOrder.map((i) => post.media[i].kind)).total)} seconds, ends on our @ card.`}
                    </span>
                  </div>
                </div>
              </>
            )}

            {postAs === 'story' && (
              <>
                <div className="social-story-frames">
                  {storyOrder.map((i, k) => (
                    <div key={post.media[i].path} className="social-story-frame">
                      {post.media[i].kind === 'video' ? (
                        <div className="social-story-clip">
                          {post.media[i].preview_path && <img src={post.media[i].preview_url} alt="" />}
                          <span>▶ Clip, as it is</span>
                        </div>
                      ) : (
                        <img src={storyFrameUrl(i, k)} alt={`Story frame ${k + 1}`} />
                      )}
                      {k === 0 ? (
                        <span className="visit-meta social-story-frame-note">Cover text above</span>
                      ) : post.media[i].kind === 'image' ? (
                        <input
                          type="text"
                          value={reelLines[i] || ''}
                          maxLength={60}
                          onChange={(e) => setReelLine(i, e.target.value)}
                          readOnly={!editable}
                          placeholder="No text"
                          aria-label={`Text on frame ${k + 1}`}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
                <p className="visit-meta">
                  {storyOrder.length} frame{storyOrder.length === 1 ? '' : 's'}, one after another. Stories show no caption, so the text is on the frames. Gone after 24 hours.
                </p>
              </>
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
        {editable && captions[network] && (
          <RemixButtons
            onRemix={(tone) => remixText(`caption_${network}`, tone, captions[network])}
            busyTone={remix?.field === `caption_${network}` && !remix.options ? remix.tone : null}
            disabled={!!remix && !remix.options}
          />
        )}
        {remix?.field === `caption_${network}` && (
          <RemixOptions remix={remix} onPick={(o) => { setCaptions({ ...captions, [network]: o }); setRemix(null); }} onClose={() => setRemix(null)} />
        )}

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
            {post.blocker ? (
              <p className="social-hint">{post.blocker}</p>
            ) : (
              postAs === 'reel' && !reelCurrent && <p className="social-hint">{post.reel ? 'You changed the text or music: tap 🎬 Make it again before approving.' : 'Make the Reel first (🎬 Make the Reel).'}</p>
            )}
            <div className="social-actions">
              <select value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-label="Approved by" className="social-approver">
                <option value="">Approved by...</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
              <button type="button" className="social-primary" onClick={approve} disabled={!!busy || !!post.blocker || !staffId || (postAs === 'reel' && !reelCurrent)}>
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
