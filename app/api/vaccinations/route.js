// app/api/vaccinations/route.js
// GET  /api/vaccinations?patient_id=X             -> one patient's vaccination history
// GET  /api/vaccinations?due=true&within_days=30  -> due/overdue across all patients,
//                                                      for the reminders dashboard
// POST /api/vaccinations                          -> record a vaccination given

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const patientId = searchParams.get('patient_id');
  const due = searchParams.get('due');

  const withPatient = due === 'true' || !patientId;
  let query = supabase
    .from('vaccinations')
    .select(
      withPatient
        ? '*, staff(full_name), patients(id, name, species, deceased, clients(id, full_name, phone, email))'
        : '*, staff(full_name)'
    );

  if (patientId) {
    query = query.eq('patient_id', patientId).order('date_given', { ascending: false });
  } else {
    query = query.order('next_due_date', { ascending: true, nullsFirst: false });
  }

  if (due === 'true') {
    const withinDays = Number(searchParams.get('within_days')) || 30;
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + withinDays);
    query = query
      .not('next_due_date', 'is', null)
      .lte('next_due_date', horizon.toISOString().slice(0, 10));
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const {
    patient_id,
    vaccine_protocol_id,
    date_given,
    next_due_date,
    batch_number,
    administered_by,
    notes,
  } = body;

  if (!patient_id || !vaccine_protocol_id || !date_given) {
    return NextResponse.json(
      { error: 'patient_id, vaccine_protocol_id, and date_given are required' },
      { status: 400 }
    );
  }

  const { data: protocol, error: protocolError } = await supabase
    .from('vaccine_protocols')
    .select('name, interval_months')
    .eq('id', vaccine_protocol_id)
    .single();

  if (protocolError || !protocol) {
    return NextResponse.json({ error: 'vaccine protocol not found' }, { status: 400 });
  }

  // Default the reminder date to date_given + the protocol's interval
  // (annual, unless the protocol says otherwise) — stays editable afterward.
  let dueDate = next_due_date || null;
  if (!dueDate) {
    const given = new Date(`${date_given}T00:00:00`);
    given.setMonth(given.getMonth() + protocol.interval_months);
    dueDate = given.toISOString().slice(0, 10);
  }

  const { data, error } = await supabase
    .from('vaccinations')
    .insert([
      {
        patient_id,
        vaccine_protocol_id,
        vaccine_name: protocol.name,
        date_given,
        next_due_date: dueDate,
        batch_number: batch_number || null,
        administered_by: administered_by || null,
        notes: notes || null,
      },
    ])
    .select('*, staff(full_name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
