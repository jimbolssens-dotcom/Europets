// lib/loginRateLimit.js
// Basic brute-force throttle for the shared-password login routes
// (/api/login, /api/accounting-login) — both gate short, memorable
// passphrases (see lib/staffAuth.js, lib/accountingAuth.js) with nothing
// else standing between a script and an unlimited number of guesses.
//
// In-memory only: resets on every cold start/redeploy and isn't shared
// across serverless instances, so it's not a airtight guarantee — but it
// blunts a straightforward brute-force script, which is the realistic
// threat here, without standing up an external store this app has no
// other need for.

const attempts = new Map(); // key -> { count, firstAttempt, blockedUntil }

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;

export function getClientKey(request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  return forwardedFor ? forwardedFor.split(',')[0].trim() : 'unknown';
}

// Returns { blocked: true, retryAfterSeconds } if this key is currently
// locked out, otherwise { blocked: false }. Call before checking the
// password.
export function checkRateLimit(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry) return { blocked: false };

  if (entry.blockedUntil) {
    if (entry.blockedUntil > now) {
      return { blocked: true, retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000) };
    }
    attempts.delete(key);
    return { blocked: false };
  }

  if (now - entry.firstAttempt > WINDOW_MS) {
    attempts.delete(key);
    return { blocked: false };
  }

  return { blocked: false };
}

// Call after a wrong password. Locks the key out once it crosses
// MAX_ATTEMPTS within WINDOW_MS.
export function recordFailedAttempt(key) {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttempt: now });
    return;
  }

  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.blockedUntil = now + BLOCK_MS;
  }
}

// Call after a correct password, so a legitimate staff member who fat-
// fingered it a few times isn't left one attempt away from a lockout.
export function clearAttempts(key) {
  attempts.delete(key);
}
