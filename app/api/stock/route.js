// app/api/stock/route.js
// GET -> every tracked stock item (migration 229) with what's on hand, its
// reorder level, whether it's low, and the catalog items or vaccines that
// use it up. ?low=1 -> just { low: n }, for the menu's alert dot.

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
    const label = `${v.vaccine_protocols?.name} (${v.vaccine_protocols?.species}${v.form === 'combo' ? ', with rabies in one vial' : ''})`;
    usedBy.set(v.stock_item_id, [...(usedBy.get(v.stock_item_id) || []), label]);
  }
  return NextResponse.json(
    (levels || []).map((l) => ({ ...l, on_hand: Number(l.on_hand), reorder_level: Number(l.reorder_level), low: isLow(l), used_by: usedBy.get(l.id) || [] }))
  );
}
