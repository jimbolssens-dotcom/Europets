// app/api/visits/[id]/video-consult/route.js
// GET  -> this visit's video call (room url), or null if none exists yet
// POST -> find-or-create the video call for this visit (creates the Daily
//         room the first time; safe to call again, returns the existing one)
// PATCH -> { status: 'active' | 'ended' } — set from the consult page when
//          staff actually starts/ends the call, since there's no webhook
//          wired up from Daily back into this app yet.
//
// Used by both the staff consult page (app/(admin)/consults/[id]/page.jsx)
// and the client-facing join page (app/portal/video-consult/[id]/page.jsx)
// — the same "no separate auth, the link itself is the access control"
// model as every other portal page.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createDailyRoom } from '@/lib/dailyVideo';
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
