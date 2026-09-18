// lib/planItemBilling.js
// A Day Treatment Plan item marked bill_once (see migration 127) can be
// tapped/logged as many times as it's actually done — every tap is still a
// normal part of the clinical record — but should only ever add ONE charge
// to the invoice for the whole stay, not one per tap (eye drops, a topical
// gel: applying it three times a day doesn't mean three times the cost).
//
// Call this right before inserting a plan-item-tagged treatment_items row.
// For a plan item that isn't bill_once, it's always billable (unchanged
// behavior). For a bill_once item, it checks whether a billable
// treatment_item already exists anywhere on this hospitalization's
// worksheet for that same plan item — if so, this new one should be
// billable: false (the one true charge already landed); otherwise this is
// the first tap and it should still bill normally.
import { supabase } from '@/lib/supabaseClient';

export async function resolvePlanItemBillable(planItemId, hospitalizationId) {
  if (!planItemId) return true;

  const { data: planItem } = await supabase
    .from('hospitalization_plan_items')
    .select('bill_once')
    .eq('id', planItemId)
    .maybeSingle();
  if (!planItem?.bill_once) return true;

  const { data: notes } = await supabase
    .from('hospitalization_notes')
    .select('id, plan_item_id, plan_item_ids')
    .eq('hospitalization_id', hospitalizationId);
  const noteIds = (notes || [])
    .filter((n) => n.plan_item_id === planItemId || (n.plan_item_ids || []).includes(planItemId))
    .map((n) => n.id);
  if (noteIds.length === 0) return true;

  const { data: existing } = await supabase
    .from('treatment_items')
    .select('id')
    .in('hospitalization_note_id', noteIds)
    .eq('billable', true)
    .limit(1);

  return !existing || existing.length === 0;
}
