// lib/phoneMatch.js
// Phone numbers get typed with inconsistent formatting (+971501234567 vs
// +971 501234567 vs 0501234567, ...) — comparing raw strings misses
// obvious duplicates. This strips everything but digits and keeps just the
// trailing digits (long enough to stay specific to one UAE mobile number,
// short enough to survive a missing/extra country code or leading 0).

const SIGNIFICANT_DIGITS = 8;

export function phoneSearchDigits(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.slice(-SIGNIFICANT_DIGITS);
}

// A client's phone can be their synced primary (clients.phone, always the
// current WhatsApp-preferred number) or any other one on file — see
// migrations/055_client_phones. Server-side matching against "does this
// client have this number anywhere" needs to check both; this returns the
// client_ids that match on the "anywhere else" side, to be combined with
// a plain clients.phone.ilike check by the caller. `pattern` is a
// ready-to-use ilike pattern (e.g. `%1234%`).
//
// Fails soft (returns []) rather than throwing — this is an enhancement
// over the baseline phone/name search, not a hard requirement, so a
// missing client_phones table (migration 055 not run yet) or any other
// hiccup here should never take basic search down with it.
export async function clientIdsWithPhoneLike(supabase, pattern) {
  if (!pattern || pattern === '%%') return [];
  try {
    const { data, error } = await supabase.from('client_phones').select('client_id').ilike('phone', pattern);
    if (error) throw error;
    return [...new Set((data || []).map((r) => r.client_id))];
  } catch {
    return [];
  }
}
