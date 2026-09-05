// app/api/intake-requests/[id]/route.js
// GET    /api/intake-requests/:id  -> fetch one request — used by both the
//                                      public intake form and the staff review page.
//                                      When it's an existing-client link (client_id
//                                      already set), also returns that client's own
//                                      patients, so the public form can offer a picker
//                                      of just those pets — never anyone else's.
// PATCH  /api/intake-requests/:id  -> { action: 'submit', ... }   the client filling
//                                      in and submitting the public form, or
//                                      { action: 'approve' | 'reject' }   staff
//                                      reviewing a submission — approving one that
//                                      requested an appointment also books it (see
//                                      lib/appointmentBooking.js for the standard
//                                      spay/castration durations; anything else isn't
//                                      self-bookable)
// DELETE /api/intake-requests/:id  -> cancel an unused link

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { CLIENT_APPOINTMENT_TYPES, CLIENT_APPOINTMENT_TYPE_LABELS } from '@/lib/appointmentBooking';
import { findAppointmentConflict } from '@/lib/appointmentScheduling';

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('intake_requests')
    .select('*, clients(id, full_name, patients(id, name, species, breed, current_weight_kg))')
    .eq('id', params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: 'intake request not found' }, { status: 404 });
  }
  return NextResponse.json(data);
}

async function submit(id, body) {
  const {
    full_name,
    phone,
    email,
    address,
    emirates_id,
    patients,
    notes,
    selected_patient_id,
    appointment_type,
    requested_vet_id,
    requested_start_time,
    requested_duration_minutes,
    custom_surgery_reason,
    preferred_date,
  } = body;

  const { data: existing, error: existingError } = await supabase
    .from('intake_requests')
    .select('status, client_id')
    .eq('id', id)
    .single();
  if (existingError || !existing) {
    return NextResponse.json({ error: 'intake request not found' }, { status: 404 });
  }
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: 'this link has already been submitted' }, { status: 409 });
  }

  const isExistingClient = Boolean(existing.client_id);
  const newPets = Array.isArray(patients) ? patients : [];

  if (isExistingClient) {
    // Owner details are already on file — just needs a pet (existing or new).
    if (!selected_patient_id && newPets.length === 0) {
      return NextResponse.json({ error: 'select one of your pets, or add a new one' }, { status: 400 });
    }
  } else {
    if (!full_name || !phone || newPets.length === 0) {
      return NextResponse.json(
        { error: 'full_name, phone, and at least one pet are required' },
        { status: 400 }
      );
    }
  }
  for (const p of newPets) {
    if (!p.name || !p.species) {
      return NextResponse.json({ error: 'each pet needs a name and species' }, { status: 400 });
    }
  }

  // An appointment request only makes sense for exactly one pet — the
  // one selected, or the one (and only) new pet being added alongside it.
  if (appointment_type) {
    if (!CLIENT_APPOINTMENT_TYPES.includes(appointment_type)) {
      return NextResponse.json({ error: `appointment_type must be one of ${CLIENT_APPOINTMENT_TYPES.join(', ')}` }, { status: 400 });
    }
    const petCount = (selected_patient_id ? 1 : 0) + newPets.length;
    if (petCount !== 1) {
      return NextResponse.json(
        { error: 'an appointment request must be for exactly one pet' },
        { status: 400 }
      );
    }
    if (appointment_type === 'other_surgery') {
      // No exact slot to pick — they've no way to know how long it'll
      // take. A description is required instead so staff know what
      // they're scheduling; a preferred day is just a suggestion.
      if (!custom_surgery_reason || !custom_surgery_reason.trim()) {
        return NextResponse.json(
          { error: 'please describe the procedure needed' },
          { status: 400 }
        );
      }
    } else if (!requested_vet_id || !requested_start_time || !requested_duration_minutes) {
      return NextResponse.json(
        { error: 'requested_vet_id, requested_start_time, and requested_duration_minutes are required with an appointment request' },
        { status: 400 }
      );
    }
  }

  const isCustomSurgery = appointment_type === 'other_surgery';

  const { data, error } = await supabase
    .from('intake_requests')
    .update({
      full_name: isExistingClient ? undefined : full_name,
      phone: isExistingClient ? undefined : phone,
      email: isExistingClient ? undefined : email || null,
      address: isExistingClient ? undefined : address || null,
      emirates_id: isExistingClient ? undefined : emirates_id || null,
      patients: newPets,
      selected_patient_id: selected_patient_id || null,
      notes: notes || null,
      appointment_type: appointment_type || null,
      requested_vet_id: appointment_type && !isCustomSurgery ? requested_vet_id : null,
      requested_start_time: appointment_type && !isCustomSurgery ? requested_start_time : null,
      requested_duration_minutes: appointment_type && !isCustomSurgery ? requested_duration_minutes : null,
      custom_surgery_reason: isCustomSurgery ? custom_surgery_reason.trim() : null,
      preferred_date: isCustomSurgery ? preferred_date || null : null,
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

async function review(id, action, existingClientId, roomId, overrides = {}) {
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

  // An existing-client link already carries its client_id from creation
  // (see POST /api/intake-requests) — reuse the same "attach, don't
  // create" path a staff-flagged duplicate match uses below.
  existingClientId = existingClientId || intake.client_id;

  // Check the requested slot is still free *before* creating anything —
  // if it's since been taken, bail out here so a conflict never leaves a
  // half-created client/patient behind.
  let appointmentVetId;
  let appointmentStart;
  let appointmentEnd;
  if (intake.appointment_type) {
    if (!roomId) {
      return NextResponse.json({ error: 'a room is required to approve an appointment request' }, { status: 400 });
    }
    appointmentVetId = overrides.vetId || intake.requested_vet_id;
    appointmentStart = new Date(overrides.startTime || intake.requested_start_time);
    const duration = Number(overrides.durationMinutes || intake.requested_duration_minutes);

    // 'other_surgery' has no requested vet/time/duration at all — the
    // client only described what's needed and suggested a day, so staff
    // must supply all three here (via overrides) to schedule it.
    if (!appointmentVetId || Number.isNaN(appointmentStart.getTime()) || !duration) {
      return NextResponse.json(
        { error: 'a vet, date/time, and duration are required to approve this request' },
        { status: 400 }
      );
    }
    appointmentEnd = new Date(appointmentStart.getTime() + duration * 60000);

    const { conflict, error: conflictError } = await findAppointmentConflict(supabase, {
      roomId,
      vetId: appointmentVetId,
      startTime: appointmentStart,
      endTime: appointmentEnd,
    });
    if (conflictError) {
      return NextResponse.json({ error: conflictError.message }, { status: 500 });
    }
    if (conflict) {
      return NextResponse.json(
        { error: 'that room or vet is no longer free for the requested time — pick a different slot' },
        { status: 409 }
      );
    }
  }

  // Approve: either attach this submission's pet(s) to a client staff
  // identified as already existing (a likely duplicate flagged in the
  // review UI, or this link's own pre-set client_id), or create a new
  // client, then a patient per pet they listed, then link the intake
  // request to that client.
  let client;
  if (existingClientId) {
    const { data: found, error: findError } = await supabase
      .from('clients')
      .select()
      .eq('id', existingClientId)
      .single();
    if (findError || !found) {
      return NextResponse.json({ error: 'the selected existing client could not be found' }, { status: 404 });
    }
    client = found;
  } else {
    const { data: created, error: clientError } = await supabase
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
    client = created;
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
  const { data: insertedPatients, error: patientsError } = await supabase
    .from('patients')
    .insert(patientRows)
    .select('id');
  if (patientsError) {
    // Roll back the client we just created — there's no cross-table
    // transaction here, so this stays a clean retry instead of leaving an
    // orphaned client behind (and a duplicate on the next approve attempt).
    // Only if we created it ourselves — never delete a pre-existing client
    // this submission was just being attached to.
    if (!existingClientId) {
      await supabase.from('clients').delete().eq('id', client.id);
    }
    const message =
      patientsError.code === '23505'
        ? "one of these pets' microchip numbers is already registered to another patient — check and fix it before approving"
        : patientsError.message;
    return NextResponse.json({ error: message }, { status: patientsError.code === '23505' ? 409 : 500 });
  }

  // The one pet this request concerns — either the existing one they
  // picked, or the one (and only, enforced at submit time) new pet they
  // just registered. Only actually needed when there's an appointment to
  // attach it to.
  const bookingPatientId = intake.selected_patient_id || insertedPatients?.[0]?.id || null;

  let appointmentId = null;
  if (intake.appointment_type) {
    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .insert([{
        patient_id: bookingPatientId,
        client_id: client.id,
        room_id: roomId,
        vet_id: appointmentVetId,
        type: intake.appointment_type === 'consult' ? 'consult' : 'surgery',
        start_time: appointmentStart.toISOString(),
        duration_minutes: Math.round((appointmentEnd.getTime() - appointmentStart.getTime()) / 60000),
        status: 'booked',
        reason:
          intake.appointment_type === 'other_surgery'
            ? `Client-requested surgery: ${intake.custom_surgery_reason}`
            : `Client-requested ${CLIENT_APPOINTMENT_TYPE_LABELS[intake.appointment_type] || intake.appointment_type}`,
        client_requested: true,
      }])
      .select('id')
      .single();
    if (appointmentError) {
      return NextResponse.json({ error: appointmentError.message }, { status: 500 });
    }
    appointmentId = appointment.id;
  }

  const { data, error } = await supabase
    .from('intake_requests')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      client_id: client.id,
      appointment_id: appointmentId,
    })
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
  if (body.action === 'approve' || body.action === 'reject') {
    return review(params.id, body.action, body.client_id, body.room_id, {
      vetId: body.vet_id,
      startTime: body.start_time,
      durationMinutes: body.duration_minutes,
    });
  }

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
