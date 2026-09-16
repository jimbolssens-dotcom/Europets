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
// never silently changes mid-stay.
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

export async function ensureHospitalizationCharges(supabase, hospitalizationId, { dogSize } = {}) {
  const { data: hosp, error: hospError } = await supabase
    .from('hospitalizations')
    .select('id, kind, status, admitted_at, discharged_at, patients(species, current_weight_kg)')
    .eq('id', hospitalizationId)
    .single();
  if (hospError || !hosp) return { error: hospError || new Error('hospitalization not found') };
  if (hosp.kind !== 'admission') return { skipped: true };

  const species = hosp.patients?.species;
  if (species !== 'cat' && species !== 'dog') return { skipped: true };

  const { data: chargeCatalogItems, error: catalogError } = await supabase
    .from('goods_services')
    .select('id, name, base_price')
    .in('name', Object.values(CHARGE_NAMES));
  if (catalogError) return { error: catalogError };

  const catalogByName = Object.fromEntries((chargeCatalogItems || []).map((c) => [c.name, c]));
  const chargeCatalogIds = (chargeCatalogItems || []).map((c) => c.id);

  const { data: noteRows, error: notesError } = await supabase
    .from('hospitalization_notes')
    .select('id, note_date')
    .eq('hospitalization_id', hospitalizationId);
  if (notesError) return { error: notesError };
  const noteIds = (noteRows || []).map((n) => n.id);
  const noteIdByDate = new Map((noteRows || []).map((n) => [n.note_date, n.id]));

  let targetItem = null;

  // Reuse whatever charge item is already on this stay, if any — locks in
  // the first day's species/size decision for every later day.
  if (noteIds.length > 0 && chargeCatalogIds.length > 0) {
    const { data: existingCharges } = await supabase
      .from('treatment_items')
      .select('goods_service_id, created_at')
      .in('hospitalization_note_id', noteIds)
      .in('goods_service_id', chargeCatalogIds)
      .order('created_at', { ascending: true })
      .limit(1);
    if (existingCharges && existingCharges.length > 0) {
      targetItem = (chargeCatalogItems || []).find((c) => c.id === existingCharges[0].goods_service_id) || null;
    }
  }

  if (!targetItem) {
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
        `Catalog is missing the "${species === 'cat' ? CHARGE_NAMES.cat : 'Hospitalisation - Dog'}" item(s) — add it in Settings > Catalog first.`
      ),
    };
  }

  const admittedDate = dubaiLocalDateString(new Date(hosp.admitted_at));
  const lastChargeableDate =
    hosp.status === 'admitted' ? dubaiLocalDateString(new Date()) : dubaiLocalDateString(new Date(hosp.discharged_at || hosp.admitted_at));

  const alreadyChargedDates = new Set();
  if (noteIds.length > 0) {
    const { data: chargedNotes } = await supabase
      .from('treatment_items')
      .select('hospitalization_note_id')
      .in('hospitalization_note_id', noteIds)
      .eq('goods_service_id', targetItem.id);
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
