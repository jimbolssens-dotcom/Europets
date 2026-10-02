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
//
// Pages through the whole table rather than trusting one unbounded
// select to return every row — PostgREST caps how many rows a single
// request returns (a project-wide "max rows" setting, 1000 by default),
// so a clinic with more client_phones rows than that would otherwise
// have this silently miss any row past the cutoff, most likely to bite
// exactly the rows that were saved most recently (a real bug found this
// way: a client's own just-edited number wasn't found by this search).
const PAGE_SIZE = 1000;

export async function clientIdsWithPhoneLike(supabase, pattern) {
  // Trimmed to the trailing significant digits (see phoneSearchDigits
  // above), not just stripped to digits — a caller passing a FULL number
  // with its country code (the WhatsApp webhook's inbound sender, e.g.
  // 971501234567) against a client record saved in local format (e.g.
  // 0501234567) used to never match: the 12-digit query is longer than
  // the 10-digit stored number, so it can never be a substring of it,
  // even though they're the same real phone number. A client whose
  // record was saved in local format (the common case — see
  // app/(admin)/add) silently got a brand-new "unmatched WhatsApp
  // number" thread instead of landing on their existing one.
  const queryDigits = phoneSearchDigits(pattern);
  if (queryDigits.length < 3) return [];
  try {
    const matchedClientIds = new Set();
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('client_phones')
        .select('client_id, phone')
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      for (const r of data || []) {
        if ((r.phone || '').replace(/\D/g, '').includes(queryDigits)) {
          matchedClientIds.add(r.client_id);
        }
      }
      if (!data || data.length < PAGE_SIZE) break;
    }
    return [...matchedClientIds];
  } catch {
    return [];
  }
}
