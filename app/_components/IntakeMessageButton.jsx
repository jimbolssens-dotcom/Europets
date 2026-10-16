'use client';

// "💬 Message" on a registration form waiting for review
// (IntakeReviewCard): lets staff WhatsApp the person who filled it in
// without approving or rejecting anything. Sent from the clinic's number
// through POST /api/client-messages/unmatched/:phone, which uses the
// pre-approved first-contact template when they haven't messaged in the
// last 24 hours. The conversation then carries on under "Unregistered
// numbers" in Messages, and joins their client record once one exists.

import { useState } from 'react';
import { whatsappDigits } from '@/lib/clientPhoneDigits';

export default function IntakeMessageButton({ phone, name }) {
  const [open, setOpen] = useState(false);
  const [staff, setStaff] = useState([]);
  const [staffId, setStaffId] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // { ok, message }
  const digits = whatsappDigits(phone);
  if (!digits) return null;

  function toggle() {
    const next = !open;
    setOpen(next);
    setResult(null);
    if (next && staff.length === 0) {
      fetch('/api/staff')
        .then((res) => res.json())
        .then((data) => setStaff(Array.isArray(data) ? data.filter((s) => s.active !== false) : []))
        .catch(() => {});
    }
  }

  async function send() {
    if (!text.trim() || !staffId) return;
    setSending(true);
    setResult(null);
    const res = await fetch(`/api/client-messages/unmatched/${encodeURIComponent(digits)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text, staff_id: staffId, client_name: name || null }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setResult({ ok: false, message: data.error || 'Could not send the message' });
      return;
    }
    setText('');
    setResult({ ok: true, message: 'Sent. Their reply will show under Unregistered numbers in Messages.' });
  }

  return (
    <>
      <button type="button" className="secondary" onClick={toggle}>
        💬 Message
      </button>
      {open && (
        <div className="intake-message-compose">
          <textarea
            rows={3}
            placeholder={`WhatsApp to ${phone}...`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="intake-message-compose-row">
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Sending as...</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
            <button type="button" onClick={send} disabled={sending || !text.trim() || !staffId}>
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
          {result && <p className={result.ok ? 'visit-meta' : 'error'}>{result.message}</p>}
        </div>
      )}
    </>
  );
}
