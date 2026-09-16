// app/api/hospitalizations/route.js
// GET  /api/hospitalizations?status=admitted                    -> list admissions
// GET  /api/hospitalizations?patient_id=X                        -> a patient's admission history
// GET  /api/hospitalizations?client_id=X                         -> an owner's admission history, across all their pets
// GET  /api/hospitalizations?appointment_id=X                    -> the day procedure checked in from that appointment
// GET  /api/hospitalizations?kind=day_procedure                  -> only day procedures, or ?kind=admission for real admissions
// GET  /api/hospitalizations?originating_hospitalization_id=X    -> day procedures booked off that admission (see below)
// POST /api/hospitalizations                                     -> admit a patient, or start a day procedure (kind: 'day_procedure')
//
// Can be started from a consult (pass originating_visit_id — the patient,
// client, and room default from that visit), from a booked appointment
// (pass appointment_id — a surgery-type slot checks in straight to a day
// procedure instead of a consult, see the appointments page), from an
// admission that's still open (pass originating_hospitalization_id — see
// the "Book Day Procedure" action on the hospitalization page; unlike
// originating_visit_id/appointment_id this is never deduped, since one
// stay can have several procedures booked off it), or standalone from the
// patient file.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { attachCages } from '@/lib/attachCages';
import { dubaiDayBoundaries } from '@/lib/dubaiTime';
import { NextResponse } from 'next/server';

// The existing twice-daily "morning by 12:00, afternoon by 18:00" alarm —
// originally satisfied by any worksheet entry at all — now specifically
// means "was temperature checked" (see migration 104's Temperature Day
// Treatment Plan item): a morning/afternoon slot is only "done" once a
// note carrying an actual temperature_c reading lands in it, not just any
// note. Weight rides the same query but has its own, simpler rule (one
// reading anywhere today, flagged once the 18:00 cutoff passes with none
// logged) since it isn't a twice-a-day thing. Applies to every open
// hospitalization — admission or day procedure — not just ones with a
// cage assigned, since a day procedure still needs its vitals checked.
async function attachScheduledUpdateStatus(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const admitted = rows.filter((h) => h.status === 'admitted');
  if (admitted.length === 0) {
    return rows.map((h) => ({
      ...h,
      scheduled_update_overdue: false,
      scheduled_update_overdue_period: null,
      scheduled_updates_expected: 0,
      scheduled_updates_done: 0,
      vitals_weight_overdue: false,
    }));
  }

  const { nowMs, startUtcMs, noonUtcMs, eveningUtcMs } = dubaiDayBoundaries();
  const ids = admitted.map((h) => h.id);
  const { data: todayNotes, error } = await supabase
    .from('hospitalization_notes')
    .select('hospitalization_id, created_at, weight_kg, temperature_c')
    .in('hospitalization_id', ids)
    .gte('created_at', new Date(startUtcMs).toISOString());

  // Don't break the hospitalization screen if the reminder query itself
  // ever fails; the normal admission data is more important than an alarm.
  if (error) return rows;

  const notesByHospitalization = (todayNotes || []).reduce((groups, note) => {
    (groups[note.hospitalization_id] ||= []).push(note);
    return groups;
  }, {});

  return rows.map((h) => {
    if (h.status !== 'admitted') {
      return {
        ...h,
        scheduled_update_overdue: false,
        scheduled_update_overdue_period: null,
        scheduled_updates_expected: 0,
        scheduled_updates_done: 0,
        vitals_weight_overdue: false,
      };
    }

    const notes = notesByHospitalization[h.id] || [];
    const admittedMs = new Date(h.admitted_at).getTime();

    const morningExpected = nowMs >= noonUtcMs && admittedMs < noonUtcMs;
    const afternoonExpected = nowMs >= eveningUtcMs && admittedMs < eveningUtcMs;
    // "Done" counts today's temperature readings cumulatively rather than
    // checking each one's own timestamp against noon — a reading logged a
    // few minutes after the noon deadline still satisfies the morning
    // check that was due by then; requiring it to have landed strictly
    // before noon left it permanently stuck "overdue" for the rest of the
    // day no matter how many readings came in afterward. The 1st reading
    // of the day satisfies morning, a 2nd satisfies afternoon too.
    const tempReadingsToday = notes.filter((n) => n.temperature_c != null).length;
    const morningDone = tempReadingsToday >= 1;
    const afternoonDone = tempReadingsToday >= 2;

    const morningOverdue = morningExpected && !morningDone;
    const afternoonOverdue = afternoonExpected && !afternoonDone;
    const expected = Number(morningExpected) + Number(afternoonExpected);
    const done = Number(morningExpected && morningDone) + Number(afternoonExpected && afternoonDone);

    let overduePeriod = null;
    if (morningOverdue && afternoonOverdue) overduePeriod = 'morning_and_afternoon';
    else if (afternoonOverdue) overduePeriod = 'afternoon';
    else if (morningOverdue) overduePeriod = 'morning';

    const weightExpected = nowMs >= eveningUtcMs && admittedMs < eveningUtcMs;
    const weightOverdue = weightExpected && !notes.some((n) => n.weight_kg != null);

    return {
      ...h,
      scheduled_update_overdue: morningOverdue || afternoonOverdue,
      scheduled_update_overdue_period: overduePeriod,
      scheduled_updates_expected: expected,
      scheduled_updates_done: done,
      vitals_weight_overdue: weightOverdue,
    };
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const patientId = searchParams.get('patient_id');
  const clientId = searchParams.get('client_id');
  const originatingVisitId = searchParams.get('originating_visit_id');
  const appointmentId = searchParams.get('appointment_id');
  const originatingHospitalizationId = searchParams.get('originating_hospitalization_id');
  const kind = searchParams.get('kind');

  let query = supabase
    .from('hospitalizations')
    .select('*, patients(name, species, patient_number, current_weight_kg), clients(full_name, phone, client_number), rooms(name)')
    .order('admitted_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }
  if (patientId) {
    query = query.eq('patient_id', patientId);
  }
  if (clientId) {
    query = query.eq('client_id', clientId);
  }
  if (originatingVisitId) {
    query = query.eq('originating_visit_id', originatingVisitId);
  }
  if (appointmentId) {
    query = query.eq('appointment_id', appointmentId);
  }
  if (originatingHospitalizationId) {
    query = query.eq('originating_hospitalization_id', originatingHospitalizationId);
  }
  if (kind) {
    query = query.eq('kind', kind);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const withCages = await attachCages(data);
  return NextResponse.json(await attachScheduledUpdateStatus(withCages));
}

export async function POST(request) {
  const body = await request.json();
  let { patient_id, client_id, originating_visit_id, appointment_id, originating_hospitalization_id, room_id, cage_id, reason, kind } = body;

  if (kind && !['admission', 'day_procedure'].includes(kind)) {
    return NextResponse.json({ error: "kind must be 'admission' or 'day_procedure'" }, { status: 400 });
  }

  // A stale consult page should open its existing admission, not book it again.
  if (originating_visit_id) {
    const { data: linked, error: linkedError } = await supabase
      .from('hospitalizations').select('*')
      .eq('originating_visit_id', originating_visit_id)
      .order('admitted_at', { ascending: false });
    if (linkedError) return NextResponse.json({ error: 'Could not check the linked hospitalization. Please try again.' }, { status: 500 });
    const existing = linked?.find((row) => row.status === 'admitted') || linked?.[0];
    if (existing) return NextResponse.json(existing);
  }

  // Same idea for a booked appointment checked in twice — reopen the same
  // day procedure instead of starting a second one.
  if (appointment_id) {
    const { data: linked, error: linkedError } = await supabase
      .from('hospitalizations').select('*')
      .eq('appointment_id', appointment_id)
      .order('admitted_at', { ascending: false });
    if (linkedError) return NextResponse.json({ error: 'Could not check the linked day procedure. Please try again.' }, { status: 500 });
    const existing = linked?.find((row) => row.status === 'admitted') || linked?.[0];
    if (existing) return NextResponse.json(existing);
  }

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

  if (appointment_id && (!patient_id || !client_id)) {
    const { data: appointment, error: apptError } = await supabase
      .from('appointments')
      .select('patient_id, client_id, room_id')
      .eq('id', appointment_id)
      .single();

    if (apptError || !appointment) {
      return NextResponse.json({ error: 'appointment not found' }, { status: 400 });
    }
    patient_id = patient_id || appointment.patient_id;
    client_id = client_id || appointment.client_id;
    room_id = room_id || appointment.room_id;
  }

  // Booking a day procedure off a patient who's still admitted — the
  // admission stays open in parallel, this just spins off a second row
  // (never deduped: one stay can have several procedures booked off it).
  if (originating_hospitalization_id && (!patient_id || !client_id)) {
    const { data: origin, error: originError } = await supabase
      .from('hospitalizations')
      .select('patient_id, client_id, room_id')
      .eq('id', originating_hospitalization_id)
      .single();

    if (originError || !origin) {
      return NextResponse.json({ error: 'originating hospitalization not found' }, { status: 400 });
    }
    patient_id = patient_id || origin.patient_id;
    client_id = client_id || origin.client_id;
    room_id = room_id || origin.room_id;
  }

  if (!patient_id || !client_id) {
    return NextResponse.json(
      { error: 'patient_id and client_id are required (directly, or via originating_visit_id/appointment_id/originating_hospitalization_id)' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('hospitalizations')
    .insert([
      {
        patient_id,
        client_id,
        originating_visit_id: originating_visit_id || null,
        appointment_id: appointment_id || null,
        originating_hospitalization_id: originating_hospitalization_id || null,
        room_id: room_id || null,
        cage_id: cage_id || null,
        reason: reason || null,
        kind: kind || (originating_hospitalization_id ? 'day_procedure' : 'admission'),
      },
    ])
    .select('*, patients(name, species, patient_number, current_weight_kg), clients(full_name, phone, client_number), rooms(name)')
    .single();

  if (error) {
    // The partial unique index on (cage_id) where status='admitted' blocks
    // admitting straight into a cage that's already occupied.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'That cage is already occupied.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (appointment_id) {
    await supabaseAdmin.from('appointments').update({ status: 'checked_in' }).eq('id', appointment_id);
  }

  // Every hospitalization — admission or day procedure — gets these two
  // Day Treatment Plan boxes automatically, same as migration 104's
  // backfill for admissions already open when that migration ran. Unlike
  // a normal plan item, DayTreatmentPlan.jsx requires an actual typed
  // reading to log either one, not just a tap.
  await supabaseAdmin.from('hospitalization_plan_items').insert([
    { hospitalization_id: data.id, label: 'Temperature', kind: 'vitals_temperature' },
    { hospitalization_id: data.id, label: 'Weight', kind: 'vitals_weight' },
  ]);

  return NextResponse.json(await attachCages(data), { status: 201 });
}
