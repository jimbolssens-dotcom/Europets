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

// The number in the shape Meta's send API needs: the full international
// number, digits only. Unlike normalizePhoneDigits this leaves a foreign
// number alone ("+44 7700..." stays 447700...), and only adds 971 to a
// number written the local way ("0564154764", "564154764"). Sending the
// stored text as-is failed for every client saved without the +971.
export function whatsappDigits(input) {
  const raw = (input || '').trim();
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (!raw.startsWith('+') && digits.startsWith('0')) return `971${digits.slice(1)}`;
  else if (!raw.startsWith('+') && digits.length === 9 && digits.startsWith('5')) return `971${digits}`;
  if (digits.startsWith('9710')) digits = `971${digits.slice(4)}`;
  return digits;
}
