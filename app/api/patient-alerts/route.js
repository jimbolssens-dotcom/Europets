// app/api/patient-alerts/route.js
// GET  /api/patient-alerts?patient_id=X  -> a patient's long-term notes,
//        newest first — persists across the patient's whole record, not
//        tied to any one visit
// POST /api/patient-alerts               -> add one

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const patientId = searchParams.get('patient_id');

  if (!patientId) {
    return NextResponse.json({ error: 'patient_id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('patient_alerts')
    .select('*, staff(full_name)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { patient_id, author_id, note_text } = body;

  if (!patient_id || !note_text?.trim()) {
    return NextResponse.json({ error: 'patient_id and note_text are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('patient_alerts')
    .insert([{ patient_id, author_id: author_id || null, note_text: note_text.trim() }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
