// app/api/stock/route.js
// GET -> every tracked stock item (migration 229) with what's on hand, its
// reorder level, whether it's low, and the catalog items or vaccines that
// use it up. ?low=1 -> just { low: n }, for the menu's alert dot.
// POST { goods_service_id, reorder_level? } -> start tracking a catalog item:
// a stock item under its name that counts down each time it's charged. One
// tracked before and switched off comes back with its history.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isLow } from '@/lib/stockKeeping';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const { data: levels, error } = await supabaseAdmin.from('stock_levels').select('*').eq('active', true).order('sort').order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (searchParams.get('low')) return NextResponse.json({ low: (levels || []).filter(isLow).length });

  const [{ data: links }, { data: vaccineLinks }] = await Promise.all([
    supabaseAdmin.from('stock_links').select('stock_item_id, per_unit, goods_services(name)'),
    supabaseAdmin.from('stock_vaccine_links').select('stock_item_id, form, vaccine_protocols(name, species)'),
  ]);
  const usedBy = new Map();
  for (const l of links || []) usedBy.set(l.stock_item_id, [...(usedBy.get(l.stock_item_id) || []), l.goods_services?.name].filter(Boolean));
  for (const v of vaccineLinks || []) {
    const label = `${v.vaccine_protocols?.species} ${v.vaccine_protocols?.name}${v.form === 'combo' ? ' + rabies' : ''}`;
    usedBy.set(v.stock_item_id, [...(usedBy.get(v.stock_item_id) || []), label]);
  }
  return NextResponse.json(
    (levels || []).map((l) => ({ ...l, on_hand: Number(l.on_hand), reorder_level: Number(l.reorder_level), low: isLow(l), used_by: usedBy.get(l.id) || [] }))
  );
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  if (!body.goods_service_id) return NextResponse.json({ error: 'Pick a catalog item' }, { status: 400 });
  const level = body.reorder_level === undefined || body.reorder_level === '' ? 2 : Number(body.reorder_level);
  if (!Number.isFinite(level) || level < 0) return NextResponse.json({ error: 'The reorder level must be 0 or more' }, { status: 400 });

  const { data: item, error: itemError } = await supabaseAdmin.from('goods_services').select('id, name').eq('id', body.goods_service_id).single();
  if (itemError || !item) return NextResponse.json({ error: 'That catalog item was not found' }, { status: 404 });

  // Already counted from another stock item (e.g. both urine tests use the strips).
  const { data: linked } = await supabaseAdmin.from('stock_links').select('stock_items(name, active)').eq('goods_service_id', item.id);
  const other = (linked || []).map((l) => l.stock_items).find((s) => s?.active && s.name !== item.name);
  if (other) return NextResponse.json({ error: `${item.name} already counts down ${other.name}` }, { status: 409 });

  const { data: existing } = await supabaseAdmin.from('stock_items').select('id, active').eq('name', item.name).maybeSingle();
  let stockId = existing?.id;
  if (existing) {
    const { error } = await supabaseAdmin.from('stock_items').update({ active: true, reorder_level: level }).eq('id', existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data: created, error } = await supabaseAdmin.from('stock_items').insert([{ name: item.name, reorder_level: level, sort: 50 }]).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    stockId = created.id;
  }
  // A vaccine counts from the vaccination record (stock_vaccine_links), not
  // from the charge too, or each dose would count twice.
  const { count: vaccineLinks } = await supabaseAdmin.from('stock_vaccine_links').select('stock_item_id', { count: 'exact', head: true }).eq('stock_item_id', stockId);
  if (vaccineLinks) return NextResponse.json({ id: stockId, name: item.name, reactivated: !!existing });
  const { error: linkError } = await supabaseAdmin.from('stock_links').upsert([{ stock_item_id: stockId, goods_service_id: item.id, per_unit: 1 }], { onConflict: 'stock_item_id,goods_service_id' });
  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });
  return NextResponse.json({ id: stockId, name: item.name, reactivated: !!existing });
}
