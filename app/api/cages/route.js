// app/api/cages/route.js
// GET /api/cages -> the clinic's fixed cage layout, in display order

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET() {
  const { data, error } = await supabase
    .from('cages')
    .select('*')
    .order('group_name', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
