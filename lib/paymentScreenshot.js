// lib/paymentScreenshot.js
// A client who has just paid online often sends the payment screenshot a
// few seconds later. The concierge used to answer "I've passed your photo
// to the team", and a minute later the automatic payment thank-you
// (lib/paymentThankYou.js, every 10 minutes) confirmed the payment anyway:
// two messages about one payment, one of them promising a reply that
// nobody needs to give (reviews of 23 and 26 Nov, three times). Now a
// burst of nothing but photos right after an online payment gets no
// notice; the thank-you is the answer. Pure, so it can be tested.

// How long after an online payment a lone photo is taken as its
// screenshot. The thank-you sweep runs every 10 minutes.
export const PAYMENT_SCREENSHOT_WINDOW_MS = 15 * 60 * 1000;

// The client's latest messages, since anything from us or staff.
function latestClientBurst(rows) {
  const burst = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].sender !== 'client') break;
    burst.unshift(rows[i]);
  }
  return burst;
}

// rows: the thread, oldest first. lastOnlinePaymentAt: when this client
// last paid through a pay link (invoice_payments.paid_at), or null.
export function isPaymentScreenshot(rows, lastOnlinePaymentAt, now = Date.now()) {
  if (!lastOnlinePaymentAt) return false;
  const paidAt = new Date(lastOnlinePaymentAt).getTime();
  if (!Number.isFinite(paidAt) || now - paidAt > PAYMENT_SCREENSHOT_WINDOW_MS || paidAt - now > 60000) return false;
  const burst = latestClientBurst(rows || []);
  if (burst.length === 0) return false;
  // Photos only: a word with it ("is this right?") still gets an answer.
  return burst.every((r) => r.media_type === 'image' && !String(r.body || '').trim() && !String(r.transcript || '').trim());
}
