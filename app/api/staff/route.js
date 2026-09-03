// app/api/staff/route.js
// GET  /api/staff             -> list all staff
// GET  /api/staff?role=vet    -> list staff with a given role
// POST /api/staff             -> create a new staff member

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const role = searchParams.get('role');

  let query = supabase.from('staff').select('*').order('full_name', { ascending: true });
  if (role) {
    query = query.eq('role', role);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { full_name, role, email, color } = body;

  if (!full_name || !role) {
    return NextResponse.json({ error: 'full_name and role are required' }, { status: 400 });
  }
  if (!['vet', 'tech', 'reception', 'admin'].includes(role)) {
    return NextResponse.json(
      { error: "role must be one of 'vet', 'tech', 'reception', 'admin'" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('staff')
    .insert([{ full_name, role, email, color: color || null }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
