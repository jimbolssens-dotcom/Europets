// app/api/cattery/requests/route.js
// POST /api/cattery/requests -> a logged-in client asks for a cattery stay
//   { patient_id, date_in, date_out, space_number, owner_notes? }.
//   The cat must be theirs, the stay can't start in the past, and the space
//   must be free (pending requests hold their space too). Creates a
//   cattery_bookings row with status 'requested' that expires after 48
//   hours if staff don't answer (migration 170). Nothing is confirmed until
//   staff approve it on the Cattery planner, which also sends the cattery
//   consent form (see PATCH /api/cattery/[id]).

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getClientSession } from '@/lib/clientAppAuth';
import { expireStaleRequests, findSpaceClash, validateBookingInput, REQUEST_TTL_MS } from '@/lib/catteryServer';
import { catteryToday } from '@/lib/cattery';
import { withoutDashes } from '@/lib/noDashes';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const clientId = await getClientSession(request);
  if (!clientId) return NextResponse.json({ error: 'Please log in to the app first.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { data: patient } = await supabaseAdmin
    .from('patients')
    .select('id, client_id, deceased, rehomed')
    .eq('id', body.patient_id || '')
    .maybeSingle();
  if (!patient || patient.client_id !== clientId || patient.deceased || patient.rehomed) {
    return NextResponse.json({ error: 'Pick one of your cats.' }, { status: 400 });
  }

  const invalid = validateBookingInput(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  if (body.date_in < catteryToday()) return NextResponse.json({ error: 'The stay cannot start in the past.' }, { status: 400 });

  await expireStaleRequests();
  const clash = await findSpaceClash({ spaceNumber: Number(body.space_number), dateIn: body.date_in, dateOut: body.date_out });
  if (clash) {
    return NextResponse.json({ error: `Space ${body.space_number} was just taken for some of those dates. Please pick another space.` }, { status: 409 });
  }

  const notes = typeof body.owner_notes === 'string' ? withoutDashes(body.owner_notes.trim().slice(0, 1000)) || null : null;
  const { data, error } = await supabaseAdmin
    .from('cattery_bookings')
    .insert([
      {
        patient_id: patient.id,
        client_id: clientId,
        space_number: Number(body.space_number),
        date_in: body.date_in,
        date_out: body.date_out,
        status: 'requested',
        requested_by_client: true,
        owner_notes: notes,
        request_expires_at: new Date(Date.now() + REQUEST_TTL_MS).toISOString(),
      },
    ])
    .select('id, space_number, date_in, date_out, status, request_expires_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
