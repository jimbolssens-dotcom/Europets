// app/_components/BookingConfirmationNotices.jsx
// After approving a self-booking: did the client get the confirmation?
// One line per approval. A send that failed says why and offers the
// message to send by hand from staff's WhatsApp.

'use client';

import { openWhatsApp } from '@/lib/whatsapp';

export default function BookingConfirmationNotices({ confirmations, dismiss }) {
  if (!confirmations?.length) return null;
  return (
    <div className="booking-confirmation-notices">
      {confirmations.map((c) => (
        <div key={c.id} className={`booking-confirmation-notice ${c.sent ? 'is-sent' : 'is-failed'}`}>
          <span className="booking-confirmation-text">
            {c.sent ? '✓ ' : '⚠ '}
            {c.clientId ? <a href={`/clients/${c.clientId}`}>{c.clientName}</a> : c.clientName}
            {c.sent
              ? c.channel === 'email'
                ? ': confirmation emailed (WhatsApp failed)'
                : ': confirmation sent on WhatsApp'
              : ': confirmation NOT sent'}
            {!c.sent && c.error && <span className="booking-confirmation-error"> ({c.error})</span>}
          </span>
          {!c.sent && c.message && c.phone && (
            <button type="button" className="small" onClick={() => openWhatsApp(c.phone, c.message)}>
              Send by hand
            </button>
          )}
          <button
            type="button"
            className="small booking-confirmation-dismiss"
            aria-label="Dismiss"
            onClick={() => dismiss(c.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
