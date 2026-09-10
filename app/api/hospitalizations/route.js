// app/api/hospitalizations/route.js
// GET  /api/hospitalizations?status=admitted    -> list admissions
// GET  /api/hospitalizations?patient_id=X        -> a patient's admission history
// GET  /api/hospitalizations?client_id=X         -> an owner's admission history, across all their pets
// POST /api/hospitalizations                     -> admit a patient
//
// Can be started from a consult (pass originating_visit_id — the patient,
// client, and room default from that visit) or standalone.

import { supabase } from '@/lib/supabaseClient';
import { attachCages } from '@/lib/attachCages';
import { NextResponse } from 'next/server';

// Europets operates in Dubai (UTC+4, no daylight-saving time). These
// boundaries let the app enforce one morning update by 12:00 and one
// afternoon update by 18:00 without storing a separate alarm row.
const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function dubaiDayBoundaries(now = new Date()) {
  const shifted = new Date(now.getTime() + DUBAI_OFFSET_MS);
  const startUtcMs =
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - DUBAI_OFFSET_MS;

  return {
    nowMs: now.getTime(),
    startUtcMs,
    noonUtcMs: startUtcMs + 12 * HOUR_MS,
    eveningUtcMs: startUtcMs + 18 * HOUR_MS,
  };
}

async function attachScheduledUpdateStatus(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const admittedWithCages = rows.filter((h) => h.status === 'admitted' && h.cage_id);
  if (admittedWithCages.length === 0) {
    return rows.map((h) => ({
      ...h,
      scheduled_update_overdue: false,
      scheduled_update_overdue_period: null,
      scheduled_updates_expected: 0,
      scheduled_updates_done: 0,
    }));
  }

  const { nowMs, startUtcMs, noonUtcMs, eveningUtcMs } = dubaiDayBoundaries();
  const ids = admittedWithCages.map((h) => h.id);
  const { data: todayNotes, error } = await supabase
    .from('hospitalization_notes')
    .select('hospitalization_id, created_at')
    .in('hospitalization_id', ids)
    .gte('created_at', new Date(startUtcMs).toISOString())
    .order('created_at', { ascending: true });

  // Don't break the hospitalization screen if the reminder query itself
  // ever fails; the normal admission data is more important than an alarm.
  if (error) return rows;

  const notesByHospitalization = (todayNotes || []).reduce((groups, note) => {
    (groups[note.hospitalization_id] ||= []).push(note);
    return groups;
  }, {});

  return rows.map((h) => {
    if (h.status !== 'admitted' || !h.cage_id) {
      return {
        ...h,
        scheduled_update_overdue: false,
        scheduled_update_overdue_period: null,
        scheduled_updates_expected: 0,
        scheduled_updates_done: 0,
      };
    }

    const admittedMs = new Date(h.admitted_at).getTime();
    const morningExpected = nowMs >= noonUtcMs && admittedMs < noonUtcMs;
    const afternoonExpected = nowMs >= eveningUtcMs && admittedMs < eveningUtcMs;
    const notes = notesByHospitalization[h.id] || [];

    // Assign notes to slots chronologically. A missed morning may be made up
    // later in the day, but a note entered before noon can never satisfy the
    // afternoon slot. This prevents two morning entries from accidentally
    // counting as both required daily updates.
    let morningDone = false;
    let afternoonDone = false;
    for (const note of notes) {
      const noteMs = new Date(note.created_at).getTime();
      if (morningExpected && !morningDone) {
        morningDone = true;
        continue;
      }
      if (afternoonExpected && !afternoonDone && noteMs >= noonUtcMs) {
        afternoonDone = true;
      }
    }

    const morningOverdue = morningExpected && !morningDone;
    const afternoonOverdue = afternoonExpected && !afternoonDone;
    const expected = Number(morningExpected) + Number(afternoonExpected);
    const done = Number(morningExpected && morningDone) + Number(afternoonExpected && afternoonDone);

    let overduePeriod = null;
    if (morningOverdue && afternoonOverdue) overduePeriod = 'morning_and_afternoon';
    else if (afternoonOverdue) overduePeriod = 'afternoon';
    else if (morningOverdue) overduePeriod = 'morning';

    return {
      ...h,
      scheduled_update_overdue: morningOverdue || afternoonOverdue,
      scheduled_update_overdue_period: overduePeriod,
      scheduled_updates_expected: expected,
      scheduled_updates_done: done,
    };
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const patientId = searchParams.get('patient_id');
  const clientId = searchParams.get('client_id');

  let query = supabase
    .from('hospitalizations')
    .select('*, patients(name, species, current_weight_kg), clients(full_name, phone), rooms(name)')
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

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const withCages = await attachCages(data);
  return NextResponse.json(await attachScheduledUpdateStatus(withCages));
}

export async function POST(request) {
  const body = await request.json();
  let { patient_id, client_id, originating_visit_id, room_id, cage_id, reason } = body;

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
        cage_id: cage_id || null,
        reason: reason || null,
      },
    ])
    .select('*, patients(name, species, current_weight_kg), clients(full_name, phone), rooms(name)')
    .single();

  if (error) {
    // The partial unique index on (cage_id) where status='admitted' blocks
    // admitting straight into a cage that's already occupied.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'That cage is already occupied.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(await attachCages(data), { status: 201 });
}
