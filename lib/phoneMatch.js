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
// client have this number anywhere" needs to check both, and needs to
// match regardless of how either side is formatted: staff type numbers
// with all sorts of spacing/dashes/country codes via the phone editor
// (only clients.phone.ilike gets normalized digits from the callers
// below; client_phones itself is stored as typed), so a plain ilike on
// the raw stored value misses a real match whenever the punctuation
// differs. This strips both sides to digits-only before comparing.
// `pattern` is a ready-to-use ilike-style pattern (e.g. `%1234%` or
// `%050 123 4567%`) — only its digits matter here.
//
// Fails soft (returns []) rather than throwing — this is an enhancement
// over the baseline phone/name search, not a hard requirement, so a
// missing client_phones table (migration 055 not run yet) or any other
// hiccup here should never take basic search down with it.
export async function clientIdsWithPhoneLike(supabase, pattern) {
  const queryDigits = (pattern || '').replace(/%/g, '').replace(/\D/g, '');
  if (queryDigits.length < 3) return [];
  try {
    const { data, error } = await supabase.from('client_phones').select('client_id, phone');
    if (error) throw error;
    return [
      ...new Set(
        (data || [])
          .filter((r) => (r.phone || '').replace(/\D/g, '').includes(queryDigits))
          .map((r) => r.client_id)
      ),
    ];
  } catch {
    return [];
  }
}
