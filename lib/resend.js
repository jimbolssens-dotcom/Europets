// lib/resend.js
// Thin wrapper over Resend's email-sending API — currently only used by
// the nightly database backup (app/api/backups/nightly), but written
// generically since this is the app's first outbound-email integration
// (everything else talks to clients over WhatsApp) and a future feature
// may want it too.
//
// Requires RESEND_API_KEY (a free account at resend.com covers this —
// low volume, one email a night). BACKUP_FROM_EMAIL is who it's sent
// from; sending as your own domain (e.g. info@epc.vet) needs that domain
// verified in Resend first (DNS records — see the on-site-backup
// conversation this came out of), so this falls back to Resend's own
// no-verification-needed sandbox address until that's done.

const FROM_FALLBACK = 'Europets Clinic <onboarding@resend.dev>';

export async function sendEmail({ to, subject, text, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');

  const from = process.env.BACKUP_FROM_EMAIL || FROM_FALLBACK;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
      // Resend expects base64 file content, no data: URI prefix.
      ...(attachments ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })) } : {}),
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Resend send failed (${res.status})`);
  }
  return res.json();
}
