'use client';

// A client's personal payment link (lib/payLinks.js): anyone with it pays
// any amount towards that client's account at the clinic, by card with
// Nomod. The clinic app puts it towards their bills and keeps the rest as
// credit for their next visit. For a rescuer, staff can turn on a
// personalised page (lib/payLinks.js#payPage) in one of two styles: the
// clinic's photo page (a cover picture, story and a ready-made Story
// picture to share) or the rescuer's own page (their Instagram profile,
// bio and links). Both show any supporter bonus, recent supporters, the
// bills already paid and their latest Instagram posts.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CONTACT } from '@/lib/content';
import { PAY_LINK_MIN, PAY_LINK_MAX, payLinkAmountError, bonusFor } from '@/lib/payLinkRules';

const QUICK = [50, 100, 200, 500];

function when(iso) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(mins)) return '';
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  const days = Math.round(mins / 1440);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function money(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Which payment this browser started, so the page can say when it's in.
const startedKey = (token) => `europets-pay-${token}`;

// view 'clinic': the clinic's own page for the rescuer (app/rescues/[token]),
// always the photo style; else the link's own page (app/pay/[token]).
export default function PayLinkView({ view = null }) {
  const { token } = useParams();
  const [state, setState] = useState('loading'); // loading | ready | not_found
  const [info, setInfo] = useState(null);
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [showName, setShowName] = useState(true);
  const [copied, setCopied] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(null);
  const [returned, setReturned] = useState(null); // null | 'success' | 'failure'

  const load = () => {
    let started = null;
    try {
      started = sessionStorage.getItem(startedKey(token));
    } catch {}
    return fetch(`/api/pay/${token}?${[started && `link=${started}`, view && `view=${view}`].filter(Boolean).join('&')}`)
      .then((res) => {
        if (!res.ok) throw new Error('not_found');
        return res.json();
      })
      .then((data) => {
        setInfo(data);
        setState('ready');
        return data;
      })
      .catch(() => setState('not_found'));
  };

  useEffect(() => {
    const paid = new URLSearchParams(window.location.search).get('paid');
    if (paid === '1') setReturned('success');
    else if (paid === '0') setReturned('failure');
    load();
    // Back from paying: check every few seconds until it's confirmed.
    if (paid === '1') {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        load().then((data) => {
          if (data?.payment?.received || attempts >= 12) clearInterval(timer);
        });
      }, 5000);
      return () => clearInterval(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function pay(e) {
    e.preventDefault();
    const value = Math.round(Number(amount) * 100) / 100;
    const problem = payLinkAmountError(value);
    if (problem) return setError(problem);
    setPaying(true);
    setError(null);
    const res = await fetch(`/api/pay/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: value, name, show_name: !!info?.page?.supporters && showName, view }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPaying(false);
      return setError(data.error || 'Something went wrong. Please try again.');
    }
    try {
      if (data.id) sessionStorage.setItem(startedKey(token), data.id);
    } catch {}
    window.location.href = data.url;
  }

  if (state === 'loading') {
    return (
      <div className="section">
        <div className="container review-submit-narrow">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (state === 'not_found') {
    return (
      <div className="section">
        <div className="container review-submit-narrow">
          <h1 className="page-title">Link not found</h1>
          <p className="page-lede">
            This payment link doesn&apos;t work any more. Please ask for a new one, or{' '}
            <a href={`https://wa.me/${CONTACT.whatsappHref}`}>message us on WhatsApp</a>.
          </p>
        </div>
      </div>
    );
  }

  const who = info.client_first_name;
  const pet = info.pet_name;
  const received = info.payment?.received;
  const due = Number(info.balance_due || 0);
  const page = info.page;
  const notices = (
    <>
      {returned === 'success' && (
        <p className="settle-bill-notice">
          {received
            ? `Thank you! Your payment of AED ${money(info.payment.amount)} has been received.`
            : "Thank you! We're confirming your payment now. This can take a minute or two."}
        </p>
      )}
      {returned === 'failure' && (
        <p className="settle-bill-notice settle-bill-notice-error">That payment didn&apos;t go through. No charge was made. Feel free to try again below.</p>
      )}
    </>
  );
  const promo = page?.promotion;
  const quick = promo ? [100, ...promo.tiers.map((t) => Number(t.min))].filter((v, k, all) => all.indexOf(v) === k).slice(0, 4) : QUICK;
  const bonus = promo ? bonusFor(promo.tiers, Number(amount)) : 0;
  const form = (opts = {}) => (
    <form className="card settle-bill-card review-submit-form pay-link-form" onSubmit={pay}>
      {!opts.gift && due > 0 && (
        <p className="settle-bill-amount">
          AED {money(due)}
          <span>still to pay on the account</span>
        </p>
      )}

      <label htmlFor="payAmount">{opts.gift ? 'Your gift (AED)' : 'Amount (AED)'}</label>
      <div className="pay-link-chips">
        {quick.map((q) => (
          <button key={q} type="button" className={`pay-link-chip${Number(amount) === q ? ' pay-link-chip-on' : ''}`} onClick={() => setAmount(String(q))}>
            {q.toLocaleString('en-US')}
          </button>
        ))}
        {!opts.gift && due >= PAY_LINK_MIN && due <= PAY_LINK_MAX && !QUICK.includes(due) && (
          <button type="button" className={`pay-link-chip${Number(amount) === due ? ' pay-link-chip-on' : ''}`} onClick={() => setAmount(String(due))}>
            All {money(due)}
          </button>
        )}
      </div>
      <input
        id="payAmount"
        type="text"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
        placeholder={`Any amount from ${PAY_LINK_MIN} to ${PAY_LINK_MAX.toLocaleString('en-US')}`}
      />

      <label htmlFor="payName">Your name (optional)</label>
      <input id="payName" type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={opts.gift ? 'So they know who to thank' : 'So they know who to thank'} />
      {opts.supporters && (
        <label className="pay-link-check">
          <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} /> Show my first name and gift on this page
        </label>
      )}

      {error && <p className="form-error">{error}</p>}
      {bonus > 0 && (
        <p className="rescue-bonus-hint">🎁 Your gift also takes <strong>AED {bonus}</strong> off {who ? `${who}'s` : 'their'} vet bills, from Europets.</p>
      )}

      <button type="submit" className="btn btn-primary" disabled={paying || !amount}>
        {paying ? 'Going to the secure payment page...' : amount ? `${opts.gift ? 'Give' : 'Pay'} AED ${money(amount)}` : opts.gift ? 'Give' : 'Pay'}
      </button>
      <p className="review-submit-hint">Card payments are handled by Nomod. We never see your card details.</p>
    </form>
  );

  if (page) {
    const pageUrl = typeof window !== 'undefined' ? `${window.location.origin}${info.share_path || `/pay/${token}`}` : '';
    const ig = page.instagram;
    const displayName = ig?.name || (who ? `${who}'s rescue` : 'Rescue');
    const heading = page.title || `Support ${who ? `${who}'s` : 'this'} rescue`;
    const shareText = `${page.style === 'instagram' ? `Support ${displayName}` : heading}: ${pageUrl}`;
    async function saveStory() {
      try {
        const blob = await fetch(page.story_image_url).then((res) => res.blob());
        const file = new File([blob], 'europets-story.jpg', { type: 'image/jpeg' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) return await navigator.share({ files: [file] });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (err) {
        if (err?.name !== 'AbortError') window.open(page.story_image_url, '_blank');
      }
    }
    async function copyLink() {
      try {
        await navigator.clipboard.writeText(pageUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {}
    }

    // The pieces both styles share.
    const linkButtons = (page.links || []).map((l) => (
      <a key={l.url} className="btn btn-ghost" href={l.url} target="_blank" rel="noreferrer">
        {l.label}
      </a>
    ));
    const promoBox = promo && (
      <div className="card rescue-promo">
        <strong>🎁 Europets adds a bonus</strong>
        <span>For every gift, we take money off {who ? `${who}'s` : 'the'} vet bills too:</span>
        <ul>
          {promo.tiers.map((t) => (
            <li key={t.min}>
              <span>Give</span>
              <b>AED {Number(t.min).toLocaleString('en-US')}</b>
              <b className="rescue-promo-off">AED {Number(t.bonus).toLocaleString('en-US')} off</b>
            </li>
          ))}
        </ul>
        {promo.ends_at && <em>Until {new Date(promo.ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</em>}
      </div>
    );
    const billsLine = page.bills_paid > 0 && (
      <p className="rescue-progress-meta">
        Supporters have paid <strong>AED {Math.round(page.bills_paid).toLocaleString('en-US')}</strong> of vet bills through this page
        {page.supporter_count > 0 ? `, in ${page.supporter_count} ${page.supporter_count === 1 ? 'gift' : 'gifts'}` : ''}. Thank you!
      </p>
    );
    const supportersList = page.supporters?.length > 0 && (
      <>
        <h2 className="rescue-h">💗 Recent support</h2>
        <ul className="rescue-supporters">
          {page.supporters.map((p, k) => (
            <li key={k}>
              <span className="rescue-hex rescue-hex-sm">{p.name[0]}</span>
              <span>{p.name}</span>
              <strong>AED {Math.round(p.amount).toLocaleString('en-US')}</strong>
              <em>{when(p.at)}</em>
            </li>
          ))}
        </ul>
      </>
    );
    const posts = ig?.posts?.length > 0 && (
      <>
        <h2 className="rescue-h">📸 Latest from @{ig.username}</h2>
        <div className="rescue-updates">
          {ig.posts.map((m) => (
            <a key={m.permalink} href={m.permalink} target="_blank" rel="noreferrer" className="rescue-post">
              <img src={m.image} alt="" loading="lazy" />
              {m.video && <span className="rescue-post-play">▶</span>}
            </a>
          ))}
        </div>
      </>
    );
    const foot = <p className="rescue-foot">Payments go to Europets Clinic, Sharjah, and are used only for this rescue&apos;s vet bills.</p>;

    // The rescuer's own page: their Instagram profile on top, their links
    // as buttons, then the bonus and the form.
    if (page.style === 'instagram') {
      return (
        <div className="section rescue-page">
          <div className="container review-submit-narrow">
            <div className="rescue-profile">
              {ig?.profile_picture_url ? <img className="rescue-avatar" src={ig.profile_picture_url} alt="" /> : <span className="rescue-hex rescue-hex-lg">{displayName[0]}</span>}
              <h1>{displayName}</h1>
              {ig && (
                <a className="rescue-handle" href={`https://instagram.com/${ig.username}`} target="_blank" rel="noreferrer">
                  @{ig.username}
                </a>
              )}
              <p className="rescue-stats">
                {[ig?.followers_count != null && `${Number(ig.followers_count).toLocaleString('en-US')} followers`, page.animals ? `${page.animals.toLocaleString('en-US')} animals cared for at Europets` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {ig?.biography && <p className="rescue-bio">{ig.biography}</p>}
              <div className="rescue-links">
                {ig && (
                  <a className="btn btn-primary" href={`https://instagram.com/${ig.username}`} target="_blank" rel="noreferrer">
                    📸 Follow on Instagram
                  </a>
                )}
                {linkButtons}
              </div>
            </div>
            {page.story && <p className="rescue-story">{page.story}</p>}
            {notices}
            {promoBox}
            <h2 className="rescue-h">💗 Give towards {who ? `${who}'s` : 'their'} vet bills</h2>
            {billsLine}
            {form({ gift: true, supporters: !!page.supporters })}
            {supportersList}
            {posts}
            <div className="rescue-share-row">
              <a className="btn btn-ghost" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
                💬 Share
              </a>
              <button type="button" className="btn btn-ghost" onClick={copyLink}>
                {copied ? '✓ Copied' : '🔗 Copy link'}
              </button>
            </div>
            {foot}
          </div>
        </div>
      );
    }

    // The clinic's photo page: the cover picture, who it's for, the story,
    // and a Story picture to share.
    return (
      <div className="section rescue-page">
        <div className="container review-submit-narrow">
          {page.cover_url ? <img className="rescue-cover" src={page.cover_url} alt="" /> : <h1 className="page-title">{heading}</h1>}
          <div className="rescue-who">
            {ig?.profile_picture_url ? <img className="rescue-avatar" src={ig.profile_picture_url} alt="" /> : <span className="rescue-hex">{(who || 'R')[0]}</span>}
            <div>
              <strong>{displayName}</strong>
              <span>{[ig && `@${ig.username}`, page.animals ? `${page.animals.toLocaleString('en-US')} animals cared for with us` : null].filter(Boolean).join(' · ')}</span>
            </div>
            {ig && (
              <a className="rescue-follow" href={`https://instagram.com/${ig.username}`} target="_blank" rel="noreferrer">
                Follow
              </a>
            )}
          </div>
          {page.story && <p className="rescue-story">{page.story}</p>}
          {linkButtons.length > 0 && <div className="rescue-links">{linkButtons}</div>}
          {notices}
          {promoBox}
          {billsLine}
          {form({ gift: true, supporters: !!page.supporters })}
          {supportersList}
          {posts}

          <h2 className="rescue-h">Help spread the word</h2>
          <div className={page.story_image_url ? 'rescue-share' : 'rescue-share rescue-share-plain'}>
            {page.story_image_url && <img src={page.story_image_url} alt="Instagram Story picture" />}
            <div>
              <p>{page.story_image_url ? 'Share this page. The Story picture is made for Instagram, with the link on it.' : 'Share this page with friends who love animals.'}</p>
              <a className="btn btn-primary" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
                💬 Share on WhatsApp
              </a>
              {page.story_image_url && (
                <button type="button" className="btn btn-ghost" onClick={saveStory}>
                  📸 Save Story picture
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={copyLink}>
                {copied ? '✓ Copied' : '🔗 Copy link'}
              </button>
            </div>
          </div>
          {foot}
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="container review-submit-narrow">
        <h1 className="page-title">{pet ? `Help with ${pet}'s care` : who ? `Pay towards ${who}'s account` : 'Make a payment'}</h1>
        <p className="page-lede">
          Pay any amount securely by card. It goes straight onto {who ? `${who}'s` : 'the'} account at Europets Clinic
          {pet ? `, towards ${pet}'s bills` : ' and pays their bills'}. Anything not needed yet is kept for the next visit.
        </p>

        {notices}
        {form()}
      </div>
    </div>
  );
}
