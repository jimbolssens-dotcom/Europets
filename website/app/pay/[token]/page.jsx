'use client';

// A client's personal payment link (lib/payLinks.js): anyone with it pays
// any amount towards that client's account at the clinic, by card with
// Nomod. The clinic app puts it towards their bills and keeps the rest as
// credit for their next visit.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CONTACT } from '@/lib/content';
import { PAY_LINK_MIN, PAY_LINK_MAX, payLinkAmountError } from '@/lib/payLinkRules';

const QUICK = [50, 100, 200, 500];

function money(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Which payment this browser started, so the page can say when it's in.
const startedKey = (token) => `europets-pay-${token}`;

export default function PayLinkPage() {
  const { token } = useParams();
  const [state, setState] = useState('loading'); // loading | ready | not_found
  const [info, setInfo] = useState(null);
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(null);
  const [returned, setReturned] = useState(null); // null | 'success' | 'failure'

  const load = () => {
    let started = null;
    try {
      started = sessionStorage.getItem(startedKey(token));
    } catch {}
    return fetch(`/api/pay/${token}${started ? `?link=${started}` : ''}`)
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
      body: JSON.stringify({ amount: value, name }),
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

  return (
    <div className="section">
      <div className="container review-submit-narrow">
        <h1 className="page-title">{pet ? `Help with ${pet}'s care` : who ? `Pay towards ${who}'s account` : 'Make a payment'}</h1>
        <p className="page-lede">
          Pay any amount securely by card. It goes straight onto {who ? `${who}'s` : 'the'} account at Europets Clinic
          {pet ? `, towards ${pet}'s bills` : ' and pays their bills'}. Anything not needed yet is kept for the next visit.
        </p>

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

        <form className="card settle-bill-card review-submit-form pay-link-form" onSubmit={pay}>
          {due > 0 && (
            <p className="settle-bill-amount">
              AED {money(due)}
              <span>still to pay on the account</span>
            </p>
          )}

          <label htmlFor="payAmount">Amount (AED)</label>
          <div className="pay-link-chips">
            {QUICK.map((q) => (
              <button key={q} type="button" className={`pay-link-chip${Number(amount) === q ? ' pay-link-chip-on' : ''}`} onClick={() => setAmount(String(q))}>
                {q}
              </button>
            ))}
            {due >= PAY_LINK_MIN && due <= PAY_LINK_MAX && !QUICK.includes(due) && (
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
          <input id="payName" type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="So they know who to thank" />

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={paying || !amount}>
            {paying ? 'Going to the secure payment page...' : amount ? `Pay AED ${money(amount)}` : 'Pay'}
          </button>
          <p className="review-submit-hint">Card payments are handled by Nomod. We never see your card details.</p>
        </form>
      </div>
    </div>
  );
}
