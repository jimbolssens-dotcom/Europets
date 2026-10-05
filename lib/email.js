// lib/email.js
// The app's one outbound-email entry point — sendEmail({to, subject, text,
// attachments}). Currently only used by the nightly database backup
// (app/api/backups/nightly), but written generically since this is the
// app's first outbound-email integration (everything else talks to
// clients over WhatsApp) and a future feature may want it too.
//
// Sends through the clinic's own mailbox via plain SMTP when
// SMTP_HOST/SMTP_USER/SMTP_PASSWORD are set — whatever your web host's
// control panel (100webspace/Hostinger, cPanel, GoDaddy, ...) shows under
// "Email Accounts" for that mailbox. Falls back to Resend
// (RESEND_API_KEY) if SMTP isn't configured — kept as an alternative in
// case the clinic's own shared-hosting mail server ever has
// deliverability trouble (a dedicated sending service is generally less
// likely to get flagged as spam than shared hosting's own mail server).

import nodemailer from 'nodemailer';
import { withoutDashes } from './noDashes';

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

async function sendViaSmtp({ to, subject, text, attachments }) {
  const port = Number(process.env.SMTP_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // Port 465 is "implicit TLS" (secure: true) everywhere; 587/25 use
    // STARTTLS instead (secure: false, nodemailer upgrades the
    // connection itself) — SMTP_SECURE lets a host that doesn't follow
    // that convention override it explicitly.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    text,
    attachments: attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content, 'base64') })),
  });
}

async function sendViaResend({ to, subject, text, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('No email is configured — set SMTP_HOST/SMTP_USER/SMTP_PASSWORD, or RESEND_API_KEY');

  const from = process.env.BACKUP_FROM_EMAIL || 'Europets Clinic <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
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

export async function sendEmail(rawParams) {
  const params = { ...rawParams, subject: withoutDashes(rawParams.subject), text: withoutDashes(rawParams.text) };
  if (smtpConfigured()) return sendViaSmtp(params);
  return sendViaResend(params);
}
