// lib/worksheetGrouping.js
// One worksheet entry for items logged together (Jim, 18 Nov, and before):
// a surgery logged item by item on a day procedure (surgery, anaesthetic,
// sedation, wire, suture...) made one entry per item, two minutes apart,
// and they all moved onto the hospital stay that way. Now an entry that is
// only items joins the same person's item-only entry from the last
// GROUP_WINDOW_MS on the same day, and "Move to Hospital" folds a day
// procedure's item-only entries into one. Entries with text, readings, a
// feed, plan taps or photos are never merged. Pure, so it can be tested.

export const GROUP_WINDOW_MS = 5 * 60 * 1000;

const filled = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const CONTENT_FIELDS = [
  'notes', 'appetite', 'condition', 'temperature_c', 'weight_kg', 'stool', 'urine', 'vomit', 'drinking',
  'mood', 'temperature_feel', 'medication_given', 'force_feeding_done', 'feed_kind', 'plan_item_id',
];

// A saved entry, or a request to save one, that carries nothing but items.
export function isItemsOnly(entry) {
  if (!entry) return false;
  if (CONTENT_FIELDS.some((f) => filled(entry[f]))) return false;
  if (Array.isArray(entry.plan_item_ids) && entry.plan_item_ids.length > 0) return false;
  if (entry.has_photos === true) return false;
  return true;
}

// The entry a new item-only one should join, or null: the latest entry on
// the stay, if it's item-only, the same day, the same person (or both
// unassigned) and within the window.
export function entryToJoin(latest, { author_id = null, note_date }, now = Date.now()) {
  if (!latest || !isItemsOnly(latest)) return null;
  if (latest.note_date !== note_date) return null;
  if ((latest.author_id || null) !== (author_id || null)) return null;
  const at = new Date(latest.created_at).getTime();
  return Number.isFinite(at) && now - at >= 0 && now - at <= GROUP_WINDOW_MS ? latest : null;
}

// For "Move to Hospital": the day procedure's item-only entries to fold
// into the first of them ({ target, others }), or null when fewer than two.
export function foldPlan(notes, attachedNoteIds = new Set()) {
  const itemOnly = (notes || [])
    .filter((n) => isItemsOnly(n) && !attachedNoteIds.has(n.id))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  if (itemOnly.length < 2) return null;
  return { target: itemOnly[0], others: itemOnly.slice(1) };
}
