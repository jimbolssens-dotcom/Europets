// app/api/hospitalizations/route.js
// GET  /api/hospitalizations?status=admitted  -> list admissions
// POST /api/hospitalizations                  -> admit a patient
//
// Can be started from a consult (pass originating_visit_id — the patient,
// client, and room default from that visit) or standalone.

import { supabase } from '@/lib/supabaseClient';
import { attachCages } from '@/lib/attachCages';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  let query = supabase
    .from('hospitalizations')
    .select('*, patients(name, species, current_weight_kg), clients(full_name, phone), rooms(name)')
    .order('admitted_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(await attachCages(data));
}

export async function POST(request) {
  const body = await request.json();
  let { patient_id, client_id, originating_visit_id, room_id, reason } = body;

  if (originating_visit_id && (!patient_id || !client_id)) {
    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select('patient_id, client_id, room_id')
      .eq('id', originating_visit_id)
      .single();

    if (visitError || !visit) {
      return NextResponse.json({ error: 'originating visit not found' }, { status: 400 });
    }
    patient_id = patient_id || visit.patient_id;
    client_id = client_id || visit.client_id;
    room_id = room_id || visit.room_id;
  }

  if (!patient_id || !client_id) {
    return NextResponse.json(
      { error: 'patient_id and client_id are required (directly, or via originating_visit_id)' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('hospitalizations')
    .insert([
      {
        patient_id,
        client_id,
        originating_visit_id: originating_visit_id || null,
        room_id: room_id || null,
        reason: reason || null,
      },
    ])
    .select('*, patients(name, species, current_weight_kg), clients(full_name, phone), rooms(name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(await attachCages(data), { status: 201 });
}
