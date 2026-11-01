// app/api/smiles/route.js
// The homepage's kindness garden (migration 240, smiles).
// GET  -> { week: n, today: n, recent: [{ id, created_at, note, by }] }
// POST { note?, by? } -> one more smile planted (a flower in the garden).
// Staff only (middleware.js).

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { weekStartISO } from '@/lib/kindness';

export const dynamic = 'force-dynamic';

export async function GET() {
  const since = weekStartISO();
  const { data, error } = await supabaseAdmin
    .from('smiles')
    .select('id, created_at, note, by')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const todayStart = new Date(Date.now() + 4 * 3600e3);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayISO = new Date(todayStart.getTime() - 4 * 3600e3).toISOString();
  const rows = data || [];
  return NextResponse.json({
    week: rows.length,
    today: rows.filter((r) => r.created_at >= todayISO).length,
    recent: rows.slice(0, 60),
  });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const note = String(body.note || '').trim().slice(0, 140) || null;
  const by = String(body.by || '').trim().slice(0, 60) || null;
  const { data, error } = await supabaseAdmin.from('smiles').insert([{ note, by }]).select('id, created_at, note, by').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
