// lib/hospitalizationCharges.js
// Server-side only. Automatically bills one daily hospitalization charge
// per calendar day an admission (kind='admission' — day procedures are
// same-day, nothing to charge per-day for) stays open, species/size-
// priced against fixed catalog items:
//   Cat                -> "Hospitalisation - Cat (p/day)"
//   Dog, <=15kg         -> "Hospitalisation - Dog S/M (p/day)"
//   Dog, >15kg          -> "Hospitalisation - Dog L (p/day)"
// A dog's size is read from patients.current_weight_kg at the time the
// first charge is created; if that's not on file yet, the caller must
// pass dogSize explicitly (see the needsDogSize return below) — normally
// prompted once from the Pre-Invoice Overview panel. Once a stay has any
// charge on it, every later day reuses that SAME catalog item regardless
// of a weight update or a different dogSize passed in, so the daily rate
// never silently changes mid-stay — unless staff explicitly override it
// (see hospitalization_rate_override_id, migration 117), which always
// takes priority over both auto-detection and the reuse-lock for any day
// not yet charged; a case that already billed a few days at the standard
// rate before switching to a rescue/long-term rate keeps those days as
// they were actually charged.
//
// Called from app/api/hospitalizations/[id]/invoice/route.js right before
// syncing the invoice, so it runs every time that sync does (button
// click, or the Pre-Invoice Overview panel's own automatic sync) —
// catching up on any day(s) missed since the last sync, not just today.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { dubaiLocalDateString } from '@/lib/dubaiTime';

const CHARGE_NAMES = {
  cat: 'Hospitalisation - Cat (p/day)',
  dog_small: 'Hospitalisation - Dog S/M (p/day)',
  dog_large: 'Hospitalisation - Dog L (p/day)',
};

const DOG_SIZE_THRESHOLD_KG = 15;

function addDaysISO(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Every hospitalization daily-rate option — not just the three
// auto-detected ones above, but whatever else staff have added alongside
// them (a rescue/welfare rate, a discounted long-term-stay rate, ...).
// Matched by catalog subcategory name rather than a fixed list, so this
// stays correct as staff reorganize the catalog: anything filed under a
// subcategory whose name mentions "hospital" (however they've named
// theirs), plus anything still named the old "Hospitalisation - ..." way
// in case it hasn't been moved there. Shared by the reuse-lock check below
// (so a previously-picked non-default rate is still recognized on the next
// sync) and the category dropdown on the Pre-Invoice Overview panel.
export async function listHospitalizationRateCatalogItems(supabase) {
  const { data: subcategories, error: subcategoryError } = await supabase
    .from('catalog_subcategories')
    .select('id')
    .ilike('name', '%hospital%');
  if (subcategoryError) return { error: subcategoryError };
  const subcategoryIds = (subcategories || []).map((s) => s.id);

  const [bySubcategory, byName] = await Promise.all([
    subcategoryIds.length > 0
      ? supabase.from('goods_services').select('id, name, base_price').in('subcategory_id', subcategoryIds)
      : Promise.resolve({ data: [] }),
    supabase.from('goods_services').select('id, name, base_price').ilike('name', 'hospitalisation%'),
  ]);
  if (bySubcategory.error) return { error: bySubcategory.error };
  if (byName.error) return { error: byName.error };

  const byId = new Map();
  for (const item of [...(bySubcategory.data || []), ...(byName.data || [])]) byId.set(item.id, item);
  return { data: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

export async function ensureHospitalizationCharges(supabase, hospitalizationId, { dogSize } = {}) {
  const { data: hosp, error: hospError } = await supabase
    .from('hospitalizations')
    .select('id, kind, status, admitted_at, discharged_at, hospitalization_rate_override_id, patients(species, current_weight_kg)')
    .eq('id', hospitalizationId)
    .single();
  if (hospError || !hosp) return { error: hospError || new Error('hospitalization not found') };
  if (hosp.kind !== 'admission') return { skipped: true };

  const species = hosp.patients?.species;
  // A manual override (see hospitalization_rate_override_id, migration 117
  // — the Pre-Invoice Overview panel's category dropdown) applies to any
  // species, since a rescue/long-term/discounted rate is a deliberate
  // staff decision, not tied to the cat/dog auto-detection below.
  if (species !== 'cat' && species !== 'dog' && !hosp.hospitalization_rate_override_id) return { skipped: true };

  const { data: rateCatalogItems, error: catalogError } = await listHospitalizationRateCatalogItems(supabase);
  if (catalogError) return { error: catalogError };

  const catalogByName = Object.fromEntries((rateCatalogItems || []).map((c) => [c.name, c]));
  const rateCatalogIds = (rateCatalogItems || []).map((c) => c.id);

  const { data: noteRows, error: notesError } = await supabase
    .from('hospitalization_notes')
    .select('id, note_date')
    .eq('hospitalization_id', hospitalizationId);
  if (notesError) return { error: notesError };
  const noteIds = (noteRows || []).map((n) => n.id);
  const noteIdByDate = new Map((noteRows || []).map((n) => [n.note_date, n.id]));

  // A standing override always wins over whatever's already locked in — see
  // the module comment above for why (past charged days are untouched
  // either way, only days not yet charged pick this up).
  let targetItem = hosp.hospitalization_rate_override_id
    ? (rateCatalogItems || []).find((c) => c.id === hosp.hospitalization_rate_override_id) || null
    : null;

  // Reuse whatever charge item is already on this stay, if any — locks in
  // the first day's species/size decision (or a still-standing override)
  // for every later day.
  if (!targetItem && noteIds.length > 0 && rateCatalogIds.length > 0) {
    const { data: existingCharges } = await supabase
      .from('treatment_items')
      .select('goods_service_id, created_at')
      .in('hospitalization_note_id', noteIds)
      .in('goods_service_id', rateCatalogIds)
      .order('created_at', { ascending: true })
      .limit(1);
    if (existingCharges && existingCharges.length > 0) {
      targetItem = (rateCatalogItems || []).find((c) => c.id === existingCharges[0].goods_service_id) || null;
    }
  }

  if (!targetItem && (species === 'cat' || species === 'dog')) {
    if (species === 'cat') {
      targetItem = catalogByName[CHARGE_NAMES.cat] || null;
    } else {
      const weight = hosp.patients?.current_weight_kg;
      const resolvedSize = dogSize || (weight != null ? (weight > DOG_SIZE_THRESHOLD_KG ? 'large' : 'small') : null);
      if (!resolvedSize) return { needsDogSize: true };
      targetItem = resolvedSize === 'large' ? catalogByName[CHARGE_NAMES.dog_large] : catalogByName[CHARGE_NAMES.dog_small];
    }
  }

  if (!targetItem) {
    return {
      error: new Error(
        hosp.hospitalization_rate_override_id
          ? 'The selected hospitalization rate no longer exists in the catalog — pick a different one.'
          : `Catalog is missing the "${species === 'cat' ? CHARGE_NAMES.cat : 'Hospitalisation - Dog'}" item(s) — add it in Settings > Catalog first.`
      ),
    };
  }

  const admittedDate = dubaiLocalDateString(new Date(hosp.admitted_at));
  const lastChargeableDate =
    hosp.status === 'admitted' ? dubaiLocalDateString(new Date()) : dubaiLocalDateString(new Date(hosp.discharged_at || hosp.admitted_at));

  // A date counts as "already charged" if it has ANY hospitalization-rate
  // item on it — not just the current targetItem — otherwise switching the
  // rate mid-stay (the whole point of the override above) would re-charge
  // every already-billed day a second time under the new item instead of
  // only picking up days that were never charged at all.
  const alreadyChargedDates = new Set();
  if (noteIds.length > 0 && rateCatalogIds.length > 0) {
    const { data: chargedNotes } = await supabase
      .from('treatment_items')
      .select('hospitalization_note_id')
      .in('hospitalization_note_id', noteIds)
      .in('goods_service_id', rateCatalogIds);
    const chargedNoteIds = new Set((chargedNotes || []).map((c) => c.hospitalization_note_id));
    for (const n of noteRows) {
      if (chargedNoteIds.has(n.id)) alreadyChargedDates.add(n.note_date);
    }
  }

  const datesToCharge = [];
  for (let d = admittedDate; d <= lastChargeableDate; d = addDaysISO(d, 1)) {
    if (!alreadyChargedDates.has(d)) datesToCharge.push(d);
  }
  if (datesToCharge.length === 0) return { added: 0, goods_service_id: targetItem.id };

  for (const date of datesToCharge) {
    let noteId = noteIdByDate.get(date);
    if (!noteId) {
      const { data: newNote, error: noteError } = await supabaseAdmin
        .from('hospitalization_notes')
        .insert([{ hospitalization_id: hospitalizationId, note_date: date }])
        .select('id')
        .single();
      if (noteError) return { error: noteError };
      noteId = newNote.id;
      noteIdByDate.set(date, noteId);
    }
    const { error: itemError } = await supabaseAdmin
      .from('treatment_items')
      .insert([{ hospitalization_note_id: noteId, goods_service_id: targetItem.id, quantity: 1 }]);
    if (itemError) return { error: itemError };
  }

  return { added: datesToCharge.length, goods_service_id: targetItem.id };
}
