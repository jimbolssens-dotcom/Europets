// app/api/hospitalization-plan-items/[id]/route.js
// PATCH  /api/hospitalization-plan-items/:id  -> re-point a task at a
//        different catalog item (e.g. correcting a dictation/AI mismatch),
//        or edit its label/instructions/route. Past log entries keep
//        whatever catalog item they were logged with — only the plan
//        button itself changes going forward.
// DELETE /api/hospitalization-plan-items/:id  -> remove a task from the
//        Day Treatment Plan. The worksheet entries it already logged
//        (hospitalization_notes.plan_item_id) are kept, just unlinked
//        (on delete set null — see migrations/076).

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { resolveAdministrationMethod } from '@/lib/administrationMethods';

const VALID_FREQUENCIES = ['once_daily', 'twice_daily', 'one_time'];

export async function PATCH(request, { params }) {
  const body = await request.json();
  const { label, goods_service_id, instructions, is_surgical, frequency, quantity, bill_once } = body;

  if (!label) {
    return NextResponse.json({ error: 'label is required' }, { status: 400 });
  }
  if (frequency !== undefined && !VALID_FREQUENCIES.includes(frequency)) {
    return NextResponse.json({ error: `frequency must be one of ${VALID_FREQUENCIES.join(', ')}` }, { status: 400 });
  }
  if (quantity !== undefined && !(Number(quantity) > 0)) {
    return NextResponse.json({ error: 'quantity must be a positive number' }, { status: 400 });
  }

  // Temperature/Weight (see migration 104) are system-generated and
  // always present — DayTreatmentPlan.jsx never offers an edit dialog for
  // them, and this is the server-side backstop for that.
  const { data: existing } = await supabase
    .from('hospitalization_plan_items')
    .select('kind')
    .eq('id', params.id)
    .single();
  if (existing && existing.kind !== 'task') {
    return NextResponse.json({ error: 'this is a system item and cannot be edited' }, { status: 400 });
  }

  let resolvedMethod = null;
  if (goods_service_id) {
    const { data: catalogItem } = await supabase
      .from('goods_services')
      .select('administration_method')
      .eq('id', goods_service_id)
      .single();
    resolvedMethod = resolveAdministrationMethod(catalogItem?.administration_method).administration_method;
  }

  const update = {
    label,
    goods_service_id: goods_service_id || null,
    instructions: instructions || null,
    administration_method: resolvedMethod,
  };
  // Only touched when the caller actually sends it — DayTreatmentPlan's
  // edit dialog doesn't have this field yet, and PATCHing it unconditionally
  // would silently reset an AI- or staff-set flag back to false on every
  // unrelated edit.
  if (is_surgical !== undefined) update.is_surgical = !!is_surgical;
  if (frequency !== undefined) update.frequency = frequency;
  if (quantity !== undefined) update.quantity = Number(quantity);
  if (bill_once !== undefined) update.bill_once = !!bill_once;

  const { data, error } = await supabaseAdmin
    .from('hospitalization_plan_items')
    .update(update)
    .eq('id', params.id)
    .select('*, goods_services(name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(request, { params }) {
  const { data: existing } = await supabase
    .from('hospitalization_plan_items')
    .select('kind')
    .eq('id', params.id)
    .single();
  if (existing && existing.kind !== 'task') {
    return NextResponse.json({ error: 'this is a system item and cannot be removed' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('hospitalization_plan_items').delete().eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
