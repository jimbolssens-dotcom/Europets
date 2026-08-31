// app/api/patients/[id]/route.js
// GET /api/patients/:id  -> a single patient, with owner info

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('patients')
    .select('*, clients(id, client_number, full_name, phone, email)')
    .eq('id', params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return NextResponse.json(data);
}
