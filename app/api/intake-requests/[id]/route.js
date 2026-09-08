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
import { CLIENT_APPOINTMENT_TYPES, CLIENT_APPOINTMENT_TYPE_LABELS, appointmentTypeAllowedForSex } from '@/lib/appointmentBooking';
import { seedCoreVaccinationsFromLastGiven, seedVaccinationFromIntake } from '@/lib/vaccinationSeeding';
import { findAppointmentConflict } from '@/lib/appointmentScheduling';
import { phoneSearchDigits, clientIdsWithPhoneLike } from '@/lib/phoneMatch';
import { isStaffRequest } from '@/lib/staffAuth';

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('intake_requests')
    .select('*, clients(id, full_name, patients(id, name, species, breed, current_weight_kg, sex))')
    .eq('id', params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: 'intake request not found' }, { status: 404 });
  }
  return NextResponse.json(data);
}

// A blank QR-scan link (see /portal/intake/new) starts with no client_id,
// so the public form defaults to the full new-client questionnaire. This
// lets someone who's already a client short-circuit that by checking
// their own WhatsApp number — an unambiguous match re-points this same
// link at their client record (same effect as staff sending them their
// own "existing client" link from the Clients page), so the form can
// switch straight to picking one of their own pets. No match, more than
// one, or a link that's already tied to a client (or already submitted)
// all just fail soft — the client-facing page falls back to the normal
// new-client form rather than surfacing an error.
async function linkExistingClient(id, phone) {
  const { data: existing, error: existingError } = await supabase
    .from('intake_requests')
    .select('status, client_id')
    .eq('id', id)
    .single();
  if (existingError || !existing) {
    return NextResponse.json({ error: 'intake request not found' }, { status: 404 });
  }
  if (existing.status !== 'pending' || existing.client_id) {
    return NextResponse.json({ matched: false });
  }

  const digits = phoneSearchDigits(phone);
  if (!digits || digits.length < 8) {
    return NextResponse.json({ matched: false });
  }

  const extraIds = await clientIdsWithPhoneLike(supabase, `%${digits}%`);
  const orFilter =
    extraIds.length > 0 ? `phone.ilike.%${digits}%,id.in.(${extraIds.join(',')})` : `phone.ilike.%${digits}%`;
  const { data: matches } = await supabase.from('clients').select('id').or(orFilter);
  if (!matches || matches.length !== 1) {
    return NextResponse.json({ matched: false });
  }

  const { data, error } = await supabase
    .from('intake_requests')
    .update({ client_id: matches[0].id, sent_to_phone: phone })
    .eq('id', id)
    .select('*, clients(id, full_name, patients(id, name, species, breed, current_weight_kg, sex))')
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ matched: true, request: data });
}

async function submit(id, body) {
  const {
    full_name,
    phone,
    email,
    address,
    emirates_id,
    emirate,
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
    if (!p.name || !p.species || !p.sex) {
      return NextResponse.json({ error: 'each pet needs a name, species, and sex' }, { status: 400 });
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

    // A spay/castration only makes sense for one sex — re-checked here
    // (not just filtered out of the client's dropdown) in case of a stale
    // form or a direct API call.
    if (appointment_type === 'spay' || appointment_type === 'castration') {
      let sex = newPets[0]?.sex;
      if (selected_patient_id) {
        const { data: selectedPatient } = await supabase
          .from('patients')
          .select('sex')
          .eq('id', selected_patient_id)
          .single();
        sex = selectedPatient?.sex;
      }
      if (!appointmentTypeAllowedForSex(appointment_type, sex)) {
        return NextResponse.json(
          {
            error:
              appointment_type === 'spay'
                ? 'spay is only for a female pet'
                : 'castration is only for a male pet',
          },
          { status: 400 }
        );
      }
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
      emirate: isExistingClient ? undefined : emirate || null,
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
        emirate: intake.emirate,
      }])
      .select()
      .single();
    if (clientError) {
      return NextResponse.json({ error: clientError.message }, { status: 500 });
    }
    client = created;
    if (intake.phone) {
      // Backs clients.phone with a real client_phones row, same as any
      // client added directly on the Clients page — otherwise this
      // number would show up there but not in their editable phones list.
      await supabase
        .from('client_phones')
        .insert([{ client_id: client.id, phone: intake.phone, label: 'Mobile', is_whatsapp: true }]);
    }
  }

  const patientRows = (intake.patients || []).map((p) => ({
    client_id: client.id,
    name: p.name,
    species: p.species,
    breed: p.breed || null,
    color: p.color || null,
    date_of_birth: p.date_of_birth || null,
    sex: p.sex || null,
    microchip_number: p.microchip_number || null,
    microchip_implanted_at: p.microchip_implanted_at || null,
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

  // Puts each new pet with a last vaccination date onto the existing
  // Vaccination Reminders dashboard a year out — same as the desktop Add
  // Patient form (see lib/vaccinationSeeding.js). insertedPatients comes
  // back in the same order as patientRows/intake.patients above. When the
  // owner named the exact vaccine given (the portal form's species-gated
  // picker), seed just that one protocol instead of every core protocol for
  // the species blind; fall back to the blunt seeding for older in-flight
  // submissions that only ever collected a bare date.
  await Promise.all(
    insertedPatients.map((row, i) =>
      intake.patients[i]?.last_vaccination_protocol_id
        ? seedVaccinationFromIntake(
            supabase,
            row.id,
            intake.patients[i].last_vaccination_protocol_id,
            intake.patients[i]?.last_vaccination_date
          )
        : seedCoreVaccinationsFromLastGiven(
            supabase,
            row.id,
            intake.patients[i]?.species,
            intake.patients[i]?.last_vaccination_date
          )
    )
  );

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

  // This route is reachable without the staff PIN (middleware treats it
  // as public, by id, since the client's own 'submit' — and the portal's
  // own-number 'link_existing_client' lookup — need to be) but 'approve'/
  // 'reject'/'update_phone' are staff-only review actions layered onto
  // the same PATCH method later. Middleware can't tell those apart (it
  // only sees path + method, not the body), so this is the backstop:
  // without it, anyone holding (or guessing) an intake_request id could
  // approve their own submission against an arbitrary client_id, or
  // silently reassign who an unsent invite link goes to.
  if (['approve', 'reject', 'update_phone'].includes(body.action) && !(await isStaffRequest(request))) {
    return NextResponse.json({ error: 'Staff login required at /login' }, { status: 401 });
  }

  if (body.action === 'submit') return submit(params.id, body);
  if (body.action === 'link_existing_client') return linkExistingClient(params.id, body.phone);
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

// Cancelling an unused invite link is a staff action (see the "Cancel"
// button on the Client Invites page) — same backstop as above, since
// this whole path is public at the middleware level for GET/PATCH.
export async function DELETE(request, { params }) {
  if (!(await isStaffRequest(request))) {
    return NextResponse.json({ error: 'Staff login required at /login' }, { status: 401 });
  }

  const { error } = await supabase.from('intake_requests').delete().eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
