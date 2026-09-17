// lib/hospitalizationVitalsSync.js
// A patient can have two hospitalizations rows open in parallel — an
// admission and a same-day procedure spun off it via
// originating_hospitalization_id (see migration 090's "Book Day Procedure")
// — each with its own hospitalization_notes/plan items. Staff shouldn't
// have to type the same weight/temperature reading twice into both
// worksheets, so a vitals reading logged on either record is mirrored onto
// every other still-open record linked to it (its parent admission and/or
// its own open day procedures), tagged with THAT record's own Temperature/
// Weight plan item so its Day Treatment Plan tile shows it as done too, not
// just the shared history.
//
// This doesn't touch "Move to Hospital" (a day procedure's kind flipped to
// 'admission' in place, same row, same notes — see migration 088) since
// there's nothing to mirror there; it only matters for the two-row case.

import { supabaseAdmin } from '@/lib/supabaseAdmin';

async function linkedOpenHospitalizations(hospitalizationId) {
  const { data: self } = await supabaseAdmin
    .from('hospitalizations')
    .select('id, originating_hospitalization_id')
    .eq('id', hospitalizationId)
    .maybeSingle();
  if (!self) return [];

  const ids = new Set();
  if (self.originating_hospitalization_id) ids.add(self.originating_hospitalization_id);

  const { data: children } = await supabaseAdmin
    .from('hospitalizations')
    .select('id')
    .eq('originating_hospitalization_id', hospitalizationId);
  (children || []).forEach((c) => ids.add(c.id));

  if (ids.size === 0) return [];

  const { data: rows } = await supabaseAdmin
    .from('hospitalizations')
    .select('id')
    .in('id', [...ids])
    .eq('status', 'admitted');
  return rows || [];
}

async function vitalsPlanItemIds(hospitalizationIds) {
  if (hospitalizationIds.length === 0) return [];
  const { data } = await supabaseAdmin
    .from('hospitalization_plan_items')
    .select('id, hospitalization_id, kind')
    .in('hospitalization_id', hospitalizationIds)
    .in('kind', ['vitals_weight', 'vitals_temperature']);
  return data || [];
}

// Copies a weight/temperature reading onto every other open hospitalization
// record linked to `hospitalizationId`. Best-effort — a failure here should
// never lose the reading that was already saved on the record it was
// actually logged against.
export async function mirrorVitalsToLinkedHospitalizations(hospitalizationId, { weight_kg, temperature_c, note_date, author_id }) {
  if (weight_kg == null && temperature_c == null) return;

  try {
    const linked = await linkedOpenHospitalizations(hospitalizationId);
    if (linked.length === 0) return;

    const planItems = await vitalsPlanItemIds(linked.map((h) => h.id));

    const rows = linked.map((h) => {
      const weightItem = planItems.find((p) => p.hospitalization_id === h.id && p.kind === 'vitals_weight');
      const tempItem = planItems.find((p) => p.hospitalization_id === h.id && p.kind === 'vitals_temperature');
      const planItemIds = [weight_kg != null ? weightItem?.id : null, temperature_c != null ? tempItem?.id : null].filter(Boolean);

      return {
        hospitalization_id: h.id,
        author_id: author_id || null,
        note_date: note_date || new Date().toISOString().slice(0, 10),
        weight_kg: weight_kg ?? null,
        temperature_c: temperature_c ?? null,
        plan_item_ids: planItemIds,
        plan_item_id: planItemIds[0] || null,
        notes: 'Synced automatically from a linked hospitalization/day-procedure record.',
      };
    });

    await supabaseAdmin.from('hospitalization_notes').insert(rows);
  } catch {
    // Best-effort — the reading is already safely saved on the record it
    // was actually logged against.
  }
}

// A day procedure spun off an open admission starts with an empty
// worksheet, but the admission may already have today's weight/temperature
// logged before the new record existed to mirror into — copy those across
// once, at creation time, the same way ongoing readings get mirrored
// afterward.
export async function seedVitalsFromOrigin(newHospitalizationId, originHospitalizationId) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: originNotes } = await supabaseAdmin
      .from('hospitalization_notes')
      .select('weight_kg, temperature_c, author_id, note_date, created_at')
      .eq('hospitalization_id', originHospitalizationId)
      .eq('note_date', today)
      .order('created_at', { ascending: true });

    const withVitals = (originNotes || []).filter((n) => n.weight_kg != null || n.temperature_c != null);
    if (withVitals.length === 0) return;

    const planItems = await vitalsPlanItemIds([newHospitalizationId]);
    const weightItemId = planItems.find((p) => p.kind === 'vitals_weight')?.id || null;
    const tempItemId = planItems.find((p) => p.kind === 'vitals_temperature')?.id || null;

    const rows = withVitals.map((n) => {
      const planItemIds = [n.weight_kg != null ? weightItemId : null, n.temperature_c != null ? tempItemId : null].filter(Boolean);
      return {
        hospitalization_id: newHospitalizationId,
        author_id: n.author_id || null,
        note_date: n.note_date,
        weight_kg: n.weight_kg,
        temperature_c: n.temperature_c,
        plan_item_ids: planItemIds,
        plan_item_id: planItemIds[0] || null,
        notes: 'Synced automatically from the linked hospitalization record.',
      };
    });

    await supabaseAdmin.from('hospitalization_notes').insert(rows);
  } catch {
    // Best-effort — the new record still works fine starting blank.
  }
}
