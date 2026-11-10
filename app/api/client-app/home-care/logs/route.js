// app/api/client-app/home-care/logs/route.js
// What an owner logs from the client app (lib/homeCare.js, migration 247).
// Only ever for the logged-in client's own pets.
//
// POST { tick: { plan_id, item_key, slot } }            -> tick a dose/task done today
// POST { patient_ids: [...], kind, product?, value?,     -> log something they did,
//        note?, photo_url?, given_at? }                     for one pet or several at once
// DELETE ?id=                                            -> remove one of their own logs
//                                                           (untick, or a mistake)
// Nothing here notifies the clinic: staff see it on the patient file.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getClientSession } from '@/lib/clientAppAuth';
import { dubaiDateISO } from '@/lib/dayProcedureSchedule';
import { itemActiveOn, validateLog } from '@/lib/homeCare';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MAX_PETS_PER_LOG = 200;

export async function POST(request) {
  const clientId = await getClientSession(request);
  if (!clientId) return NextResponse.json({ error: 'not logged in' }, { status: 401 });
  const body = await request.json().catch(() => ({}));

  if (body.tick) {
    const { plan_id: planId, item_key: itemKey } = body.tick;
    const slot = Math.max(0, Math.min(3, Number(body.tick.slot) || 0));
    const { data: plan } = await supabaseAdmin.from('home_care_plans').select('id, patient_id, client_id, starts_on, items').eq('id', planId).maybeSingle();
    if (!plan) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const { data: pet } = await supabaseAdmin.from('patients').select('client_id').eq('id', plan.patient_id).maybeSingle();
    if (pet?.client_id !== clientId) return NextResponse.json({ error: 'not your pet' }, { status: 403 });
    const item = (plan.items || []).find((i) => i.key === itemKey);
    const today = dubaiDateISO();
    if (!item || (item.kind !== 'med' && item.kind !== 'task') || !itemActiveOn(plan, item, today)) {
      return NextResponse.json({ error: 'Nothing to tick for today' }, { status: 400 });
    }
    const row = { patient_id: plan.patient_id, client_id: clientId, kind: item.kind === 'med' ? 'dose' : 'task', plan_id: plan.id, item_key: itemKey, slot, for_date: today };
    const { data, error } = await supabaseAdmin.from('home_care_logs').insert([row]).select('*').single();
    if (error?.code === '23505') {
      const { data: existing } = await supabaseAdmin.from('home_care_logs').select('*').eq('plan_id', plan.id).eq('item_key', itemKey).eq('for_date', today).eq('slot', slot).maybeSingle();
      return NextResponse.json({ logs: existing ? [existing] : [] });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ logs: [data] });
  }

  const ids = [...new Set((Array.isArray(body.patient_ids) ? body.patient_ids : []).filter(Boolean))];
  if (ids.length === 0) return NextResponse.json({ error: 'Choose at least one pet' }, { status: 400 });
  if (ids.length > MAX_PETS_PER_LOG) return NextResponse.json({ error: `At most ${MAX_PETS_PER_LOG} pets at once` }, { status: 400 });
  const { row, error: invalid } = validateLog(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const { data: pets, error: petsError } = await supabaseAdmin.from('patients').select('id, client_id').in('id', ids);
  if (petsError) return NextResponse.json({ error: petsError.message }, { status: 500 });
  if ((pets || []).length !== ids.length || pets.some((p) => p.client_id !== clientId)) {
    return NextResponse.json({ error: 'not your pet' }, { status: 403 });
  }
  const rows = ids.map((patientId) => ({ ...row, patient_id: patientId, client_id: clientId }));
  const { data, error } = await supabaseAdmin.from('home_care_logs').insert(rows).select('*');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ logs: data || [] });
}

export async function DELETE(request) {
  const clientId = await getClientSession(request);
  if (!clientId) return NextResponse.json({ error: 'not logged in' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const { data: log } = await supabaseAdmin.from('home_care_logs').select('id, client_id, source').eq('id', id).maybeSingle();
  if (!log || log.client_id !== clientId || log.source !== 'owner') return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { error } = await supabaseAdmin.from('home_care_logs').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
