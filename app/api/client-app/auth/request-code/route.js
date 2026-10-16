// POST /api/client-app/auth/request-code  -> { phone, channel? }
// Starts client-app login: looks up whether any client has this number on
// file, and if so sends them a 6-digit code (see lib/clientAppAuth.js):
// by WhatsApp (lib/metaWhatsapp.js), or with channel 'email' to the email
// address(es) on file for that number, for owners without WhatsApp. The
// phone stays the identifier either way, so verify-code is unchanged. If
// the WhatsApp send itself fails, the code goes by email instead when
// there's an address on file. Replaces the old "type a phone number, no
// verification" login — see the SECURITY NOTE in app/client-app/layout.js.

import { NextResponse } from 'next/server';
import { normalizePhoneDigits, findClientsByPhone, generateOtpCode, storeOtpCode } from '@/lib/clientAppAuth';
import { sendWhatsAppOtp, isWhatsAppConfigured } from '@/lib/metaWhatsapp';
import { checkRateLimit, recordFailedAttempt, getClientKey } from '@/lib/loginRateLimit';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendEmail } from '@/lib/email';

// The distinct email addresses on file for the clients matching this phone.
async function emailsForClients(clientIds) {
  const { data } = await supabaseAdmin.from('clients').select('email').in('id', clientIds);
  const seen = new Set();
  for (const row of data || []) {
    const email = String(row.email || '').trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) seen.add(email);
  }
  return [...seen];
}

// "jane.doe@gmail.com" -> "ja***@gmail.com", so the page can say where the
// code went without showing the whole address to whoever typed the number.
function maskEmail(email) {
  const [user, domain] = email.split('@');
  return `${user.slice(0, 2)}***@${domain}`;
}

// One email per address, so family members sharing a number don't see each
// other's addresses.
async function emailCode(emails, code) {
  for (const to of emails) {
    await sendEmail({
      to,
      subject: 'Your Europets login code',
      text: `Your Europets client portal login code is ${code}\n\nIt expires in 10 minutes. If you didn't ask for this code, you can ignore this email.\n\nEuropets Clinic`,
    });
  }
  return emails.map(maskEmail);
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const phoneDigits = normalizePhoneDigits(body.phone);
  if (phoneDigits.length < 12) {
    return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
  }

  // Two independent throttles: by IP (a script hammering random numbers)
  // and by the phone itself (repeatedly WhatsApp-spamming one real
  // number) — same checkRateLimit/recordFailedAttempt helper the staff/
  // accounting logins use, just keyed differently.
  const ipKey = `otp-request-ip:${getClientKey(request)}`;
  const phoneKey = `otp-request-phone:${phoneDigits}`;
  const ipLimit = checkRateLimit(ipKey);
  if (ipLimit.blocked) {
    return NextResponse.json({ error: 'Too many requests — please try again later.' }, { status: 429 });
  }
  const phoneLimit = checkRateLimit(phoneKey);
  if (phoneLimit.blocked) {
    return NextResponse.json({ error: 'Too many requests for this number — please try again later.' }, { status: 429 });
  }

  let matches;
  try {
    matches = await findClientsByPhone(phoneDigits);
  } catch {
    return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 500 });
  }

  if (matches.length === 0) {
    recordFailedAttempt(ipKey);
    recordFailedAttempt(phoneKey);
    return NextResponse.json(
      { error: "We couldn't find that number on file — please contact the clinic to confirm or update the WhatsApp number on your account." },
      { status: 404 }
    );
  }

  const channel = body.channel === 'email' ? 'email' : 'whatsapp';
  const code = generateOtpCode();

  if (channel === 'email') {
    const emails = await emailsForClients(matches.map((m) => m.id));
    if (emails.length === 0) {
      recordFailedAttempt(ipKey);
      recordFailedAttempt(phoneKey);
      return NextResponse.json(
        { error: "There's no email address on file for this number. Please use WhatsApp, or contact the clinic to add your email.", noEmail: true },
        { status: 404 }
      );
    }
    try {
      await storeOtpCode(phoneDigits, code);
      const sentTo = await emailCode(emails, code);
      recordFailedAttempt(ipKey);
      return NextResponse.json({ ok: true, channel: 'email', sentTo });
    } catch (err) {
      return NextResponse.json({ error: 'Could not email the code. Please try again, or use WhatsApp.' }, { status: 500 });
    }
  }

  let devCode;
  try {
    await storeOtpCode(phoneDigits, code);
    // Meta's WhatsApp Business setup (System User token + registered
    // sender + approved Authentication template — see lib/metaWhatsapp.js)
    // is a real account-setup step, not something turned on by a code
    // change. Until it's configured, hand the code back in the response
    // instead of failing outright, so the rest of the client app stays
    // testable in the meantime — the login page below shows it directly.
    // This branch stops firing the moment the real credentials are set.
    if (isWhatsAppConfigured()) {
      try {
        await sendWhatsAppOtp(phoneDigits, code);
      } catch (whatsappErr) {
        // WhatsApp didn't take it (e.g. no WhatsApp on this number): the
        // same code goes by email when there's an address on file.
        const emails = await emailsForClients(matches.map((m) => m.id));
        if (emails.length === 0) throw whatsappErr;
        const sentTo = await emailCode(emails, code);
        recordFailedAttempt(ipKey);
        return NextResponse.json({ ok: true, channel: 'email', sentTo });
      }
    } else {
      devCode = code;
    }
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Could not send the code — please try again.' }, { status: 500 });
  }

  recordFailedAttempt(ipKey); // counts toward the IP throttle regardless of outcome — sending codes costs money
  return NextResponse.json({ ok: true, channel: 'whatsapp', ...(devCode ? { devCode } : {}) });
}
