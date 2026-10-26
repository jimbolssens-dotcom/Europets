// app/api/stock/[id]/movements/route.js
// GET  -> the item's last 40 movements (migration 229), newest first, with
//         what each was for (the pet, for a dose or a test used).
// POST { kind: 'received', quantity, supplier?, batch_number?, expiry_date?, note?, staff_id? }
//        a delivery came in.
//      { kind: 'count', counted, note?, staff_id? }
//        what's on the shelf now: the difference from what was expected is
//        saved as the count (lib/stockKeeping.js#countChange).

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { countChange } from '@/lib/stockKeeping';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { data, error } = await supabaseAdmin
    .from('stock_movements')
    .select(
      'id, change, kind, supplier, batch_number, expiry_date, note, created_at, staff(full_name), vaccinations(patients(name)), treatment_items(visits(patients(name)))'
    )
    .eq('stock_item_id', params.id)
    .neq('change', 0) // an edited charge's earlier count, replaced (migration 229)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(
    (data || []).map((m) => ({
      ...m,
      change: Number(m.change),
      pet: m.vaccinations?.patients?.name || m.treatment_items?.visits?.patients?.name || null,
    }))
  );
}

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const staffId = body.staff_id || null;
  const note = String(body.note || '').trim().slice(0, 500) || null;
  let row;
  if (body.kind === 'received') {
    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: 'How many came in?' }, { status: 400 });
    row = {
      change: quantity,
      kind: 'received',
      supplier: String(body.supplier || '').trim().slice(0, 120) || null,
      batch_number: String(body.batch_number || '').trim().slice(0, 60) || null,
      expiry_date: /^\d{4}-\d{2}-\d{2}$/.test(body.expiry_date || '') ? body.expiry_date : null,
      note,
    };
  } else if (body.kind === 'count') {
    const counted = Number(body.counted);
    if (!Number.isFinite(counted) || counted < 0) return NextResponse.json({ error: 'How many are on the shelf?' }, { status: 400 });
    const { data: level, error: levelError } = await supabaseAdmin.from('stock_levels').select('on_hand').eq('id', params.id).single();
    if (levelError) return NextResponse.json({ error: levelError.message }, { status: 500 });
    row = { change: countChange(level.on_hand, counted), kind: 'count', note };
  } else {
    return NextResponse.json({ error: 'kind must be received or count' }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from('stock_movements')
    .insert([{ ...row, stock_item_id: params.id, staff_id: staffId }])
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
