// app/api/intake-requests/route.js
// GET  /api/intake-requests  -> list every intake request, newest first,
//                                for the staff Intake review page
// POST /api/intake-requests  -> generate a new blank link to send someone —
//                                { sent_to_phone? }: a brand-new client,
//                                normal new-client intake, nothing filled
//                                in yet. { client_id }: an already-
//                                registered client's own "book an
//                                appointment / add a pet" link — see
//                                app/(admin)/clients/[id]'s "Send Booking
//                                Link". Setting client_id up front (rather
//                                than only once approved, as a brand-new
//                                intake does) is what scopes the public
//                                form to just that client's own pets.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET() {
  const { data, error } = await supabase
    .from('intake_requests')
    .select('*, clients(id, full_name), selected_patient:patients!selected_patient_id(name, species, breed), requested_vet:staff!requested_vet_id(full_name)')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));

  if (body.client_id) {
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', body.client_id)
      .single();
    if (clientError || !client) {
      return NextResponse.json({ error: 'client not found' }, { status: 404 });
    }
  }

  const { data, error } = await supabase
    .from('intake_requests')
    .insert([{ sent_to_phone: body.sent_to_phone || null, client_id: body.client_id || null }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
