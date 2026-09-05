// app/api/intake-requests/route.js
// GET  /api/intake-requests  -> list every invite/intake request, newest
//                                first, for the staff Invite page
// POST /api/intake-requests  -> generate a new link to send someone —
//                                { client_id }: an already-registered
//                                client's own "book an appointment / add a
//                                pet" link — see app/(admin)/clients/[id]'s
//                                "Send Invite". { sent_to_phone? } without
//                                a client_id: looked up against clients.
//                                phone/phone2 (last 8 digits, same as the
//                                Clients page search — formatting-tolerant
//                                but specific to one real number) — an
//                                unambiguous single match reuses that
//                                client's own link (skips the owner-detail
//                                fields, offers their own pets), same as
//                                if staff had sent it from their client
//                                page; no match (or more than one, which
//                                we can't safely guess between) falls back
//                                to a blank new-client form. Either way,
//                                setting client_id up front (rather than
//                                only once approved, as a brand-new
//                                signup does) is what scopes the public
//                                form to just that client's own pets.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { phoneSearchDigits } from '@/lib/phoneMatch';

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

  let clientId = body.client_id || null;

  if (clientId) {
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .single();
    if (clientError || !client) {
      return NextResponse.json({ error: 'client not found' }, { status: 404 });
    }
  } else if (body.sent_to_phone) {
    const digits = phoneSearchDigits(body.sent_to_phone);
    if (digits) {
      const { data: matches } = await supabase
        .from('clients')
        .select('id')
        .or(`phone.ilike.%${digits}%,phone2.ilike.%${digits}%`);
      if (matches && matches.length === 1) {
        clientId = matches[0].id;
      }
    }
  }

  const { data, error } = await supabase
    .from('intake_requests')
    .insert([{ sent_to_phone: body.sent_to_phone || null, client_id: clientId }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
