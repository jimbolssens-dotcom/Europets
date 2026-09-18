// POST /api/client-app/auth/request-code  -> { phone }
// Starts client-app login: looks up whether any client has this number on
// file, and if so, WhatsApps them a 6-digit code (see lib/clientAppAuth.js,
// lib/metaWhatsapp.js). Replaces the old "type a phone number, no
// verification" login — see the SECURITY NOTE in app/client-app/layout.js.

import { NextResponse } from 'next/server';
import { normalizePhoneDigits, findClientsByPhone, generateOtpCode, storeOtpCode } from '@/lib/clientAppAuth';
import { sendWhatsAppOtp } from '@/lib/metaWhatsapp';
import { checkRateLimit, recordFailedAttempt, getClientKey } from '@/lib/loginRateLimit';

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
    return NextResponse.json({ error: "We couldn't find that number on file — please contact the clinic." }, { status: 404 });
  }

  const code = generateOtpCode();
  try {
    await storeOtpCode(phoneDigits, code);
    await sendWhatsAppOtp(phoneDigits, code);
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Could not send the code — please try again.' }, { status: 500 });
  }

  recordFailedAttempt(ipKey); // counts toward the IP throttle regardless of outcome — sending codes costs money
  return NextResponse.json({ ok: true });
}
