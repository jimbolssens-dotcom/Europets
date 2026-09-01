// app/api/intake-requests/[id]/route.js
// GET    /api/intake-requests/:id  -> fetch one request — used by both the
//                                      public intake form and the staff review page
// PATCH  /api/intake-requests/:id  -> { action: 'submit', ... }   the client filling
//                                      in and submitting the public form, or
//                                      { action: 'approve' | 'reject' }   staff
//                                      reviewing a submission
// DELETE /api/intake-requests/:id  -> cancel an unused link

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('intake_requests')
    .select('*, clients(id, full_name)')
    .eq('id', params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: 'intake request not found' }, { status: 404 });
  }
  return NextResponse.json(data);
}

async function submit(id, body) {
  const { full_name, phone, email, address, emirates_id, patients, notes } = body;

  if (!full_name || !phone || !Array.isArray(patients) || patients.length === 0) {
    return NextResponse.json(
      { error: 'full_name, phone, and at least one pet are required' },
      { status: 400 }
    );
  }
  for (const p of patients) {
    if (!p.name || !p.species) {
      return NextResponse.json({ error: 'each pet needs a name and species' }, { status: 400 });
    }
  }

  const { data: existing, error: existingError } = await supabase
    .from('intake_requests')
    .select('status')
    .eq('id', id)
    .single();
  if (existingError || !existing) {
    return NextResponse.json({ error: 'intake request not found' }, { status: 404 });
  }
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: 'this link has already been submitted' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('intake_requests')
    .update({
      full_name,
      phone,
      email: email || null,
      address: address || null,
      emirates_id: emirates_id || null,
      patients,
      notes: notes || null,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

async function review(id, action) {
  const { data: intake, error: fetchError } = await supabase
    .from('intake_requests')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchError || !intake) {
    return NextResponse.json({ error: 'intake request not found' }, { status: 404 });
  }
  if (intake.status !== 'submitted') {
    return NextResponse.json({ error: 'only a submitted request can be reviewed' }, { status: 409 });
  }

  if (action === 'reject') {
    const { data, error } = await supabase
      .from('intake_requests')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // Approve: create the client, then a patient per pet they listed, then
  // link the intake request to the new client.
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .insert([{
      full_name: intake.full_name,
      phone: intake.phone,
      email: intake.email,
      address: intake.address,
      emirates_id: intake.emirates_id,
    }])
    .select()
    .single();
  if (clientError) {
    return NextResponse.json({ error: clientError.message }, { status: 500 });
  }

  const patientRows = (intake.patients || []).map((p) => ({
    client_id: client.id,
    name: p.name,
    species: p.species,
    breed: p.breed || null,
    date_of_birth: p.date_of_birth || null,
    sex: p.sex || null,
    microchip_number: p.microchip_number || null,
  }));
  const { error: patientsError } = await supabase.from('patients').insert(patientRows);
  if (patientsError) {
    // Roll back the client we just created — there's no cross-table
    // transaction here, so this stays a clean retry instead of leaving an
    // orphaned client behind (and a duplicate on the next approve attempt).
    await supabase.from('clients').delete().eq('id', client.id);
    const message =
      patientsError.code === '23505'
        ? "one of these pets' microchip numbers is already registered to another patient — check and fix it before approving"
        : patientsError.message;
    return NextResponse.json({ error: message }, { status: patientsError.code === '23505' ? 409 : 500 });
  }

  const { data, error } = await supabase
    .from('intake_requests')
    .update({ status: 'approved', reviewed_at: new Date().toISOString(), client_id: client.id })
    .eq('id', id)
    .select('*, clients(id, full_name)')
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function PATCH(request, { params }) {
  const body = await request.json();

  if (body.action === 'submit') return submit(params.id, body);
  if (body.action === 'approve' || body.action === 'reject') return review(params.id, body.action);

  // Editing/resending the number staff sent an unsubmitted link to —
  // updates the record shown in the "Sent, Awaiting Submission" list.
  if (body.action === 'update_phone') {
    const { data, error } = await supabase
      .from('intake_requests')
      .update({ sent_to_phone: body.sent_to_phone || null })
      .eq('id', params.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}

export async function DELETE(request, { params }) {
  const { error } = await supabase.from('intake_requests').delete().eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
