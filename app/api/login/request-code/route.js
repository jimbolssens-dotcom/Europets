// POST /api/login/request-code
// Sends a fresh 6-digit code to the clinic's own WhatsApp number (see
// lib/staffAuth.js's sendStaffLoginOtp) — the first step of staff login
// once STAFF_LOGIN_OTP_ENABLED is "true". Takes no body: unlike the
// client app's request-code, there's no phone to look up, just the one
// fixed destination.

import { NextResponse } from 'next/server';
import { isStaffOtpEnabled, sendStaffLoginOtp } from '@/lib/staffAuth';
import { checkRateLimit, recordFailedAttempt, getClientKey } from '@/lib/loginRateLimit';

export async function POST(request) {
  if (!isStaffOtpEnabled()) {
    return NextResponse.json({ error: 'WhatsApp login is not enabled' }, { status: 404 });
  }

  // By IP, same as the staff PIN route — plus a short fixed key so a
  // burst of requests from different IPs still can't flood the clinic's
  // WhatsApp with codes.
  const ipKey = `staff-otp-request-ip:${getClientKey(request)}`;
  const globalKey = 'staff-otp-request-global';
  const ipLimit = checkRateLimit(ipKey);
  if (ipLimit.blocked) {
    return NextResponse.json({ error: 'Too many requests — please try again later.' }, { status: 429 });
  }
  const globalLimit = checkRateLimit(globalKey);
  if (globalLimit.blocked) {
    return NextResponse.json({ error: 'Too many codes sent recently — please wait a moment and try again.' }, { status: 429 });
  }

  try {
    await sendStaffLoginOtp();
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Could not send the code — please try again.' }, { status: 500 });
  }

  recordFailedAttempt(ipKey);
  recordFailedAttempt(globalKey);
  return NextResponse.json({ ok: true });
}
