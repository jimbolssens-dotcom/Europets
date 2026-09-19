// lib/clientPhoneDigits.js
// Every phone number in the system is stored as +971<local number>, with
// no leading 0 on the local part (see migrations/071_normalize_phone_
// country_code.sql) — so a plain substring match against the stored text
// only works once the digits sent here are in that exact shape. Handles
// the same input variants: a bare local number with its leading 0
// ("0501234567"), one without ("501234567"), a country code typed with an
// international dialing prefix ("00971..."), or an accidental extra 0
// right after typing the +971 prefix.
//
// Deliberately has no other imports (unlike lib/clientAppAuth.js, which
// pulls in lib/supabaseAdmin.js) so both the client-app login form ('use
// client') and the server-side OTP routes can share this exact rule
// without the service-role key it would otherwise drag into the browser
// bundle.
export function normalizePhoneDigits(input) {
  let digits = (input || '').replace(/\D/g, '');
  if (digits.startsWith('00971')) digits = digits.slice(2);
  if (digits.startsWith('971')) {
    const rest = digits.slice(3).replace(/^0/, '');
    return `971${rest}`;
  }
  return `971${digits.replace(/^0/, '')}`;
}
