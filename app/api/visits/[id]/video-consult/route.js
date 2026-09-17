// app/api/visits/[id]/video-consult/route.js
// GET  -> this visit's video call (room url), or null if none exists yet
// POST -> find-or-create the video call for this visit (creates the Daily
//         room the first time; safe to call again, returns the existing one)
// PATCH -> { status: 'active' | 'ended' } — set from the consult page when
//          staff actually starts/ends the call, since there's no webhook
//          wired up from Daily back into this app yet. Ending a call
//          deletes the Daily room outright, not just this app's own record
//          of it — see deleteDailyRoom.
//
// Used by both the staff consult page (app/(admin)/consults/[id]/page.jsx)
// and the client-facing join page (app/portal/video-consult/[id]/page.jsx)
// — the same "no separate auth, the link itself is the access control"
// model as every other portal page.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createDailyRoom, deleteDailyRoom } from '@/lib/dailyVideo';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('video_consults')
    .select('*')
    .eq('visit_id', params.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data || null);
}

export async function POST(request, { params }) {
  const visitId = params.id;

  const { data: existing, error: existingError } = await supabase
    .from('video_consults')
    .select('*')
    .eq('visit_id', visitId)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json(existing);
  }

  // Not globally unique on its own, but combined with the visit's own id
  // this can never collide — good enough for a Daily room name, which just
  // needs to be unguessable, not globally unique in any stronger sense.
  const roomName = `europets-${visitId.slice(0, 8)}-${Date.now().toString(36)}`;

  let room;
  try {
    room = await createDailyRoom({ name: roomName });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from('video_consults')
    .insert([{ visit_id: visitId, room_name: room.name, room_url: room.url }])
    .select()
    .single();

  if (error) {
    // 23505 = unique_violation on video_consults_visit_id_key — another
    // request for this same visit won the race and inserted first (e.g. a
    // double-click on "Create Video Room" before the button had disabled
    // itself, or the patient-page flow and a manual retry overlapping).
    // The room that request created is exactly what this one wanted too,
    // so just hand that back instead of erroring.
    if (error.code === '23505') {
      const { data: raceWinner, error: refetchError } = await supabase
        .from('video_consults')
        .select('*')
        .eq('visit_id', visitId)
        .single();
      if (refetchError) {
        return NextResponse.json({ error: refetchError.message }, { status: 500 });
      }
      return NextResponse.json(raceWinner);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const { status, invited } = body;

  const update = {};
  if (status !== undefined) {
    if (!['active', 'ended', 'scheduled'].includes(status)) {
      return NextResponse.json({ error: "status must be 'scheduled', 'active', or 'ended'" }, { status: 400 });
    }
    update.status = status;
    if (status === 'active') update.started_at = new Date().toISOString();
    if (status === 'ended') update.ended_at = new Date().toISOString();
  }
  if (invited) {
    update.invited_at = new Date().toISOString();
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  // Ending a call actually deletes the Daily room — otherwise the link
  // staff already sent the client stays silently joinable (Daily has no
  // idea the app considers this call "over") until it hits its own exp,
  // hours later. Do this before the DB update so a failure here surfaces
  // as an error rather than marking the call ended while the room is
  // still live.
  if (status === 'ended') {
    const { data: videoConsult, error: fetchError } = await supabase
      .from('video_consults')
      .select('room_name')
      .eq('visit_id', params.id)
      .single();
    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    try {
      await deleteDailyRoom(videoConsult.room_name);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from('video_consults')
    .update(update)
    .eq('visit_id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
