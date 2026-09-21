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
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { phoneSearchDigits, clientIdsWithPhoneLike } from '@/lib/phoneMatch';
import { isStaffRequest } from '@/lib/staffAuth';
import { getClientSession } from '@/lib/clientAppAuth';

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

  // Reachable without the staff PIN now (the client app's own "Book an
  // Appointment"/"Video Consult" flow — see middleware.js) — a non-staff
  // caller carrying a client_id must be booking for themselves. The
  // anonymous new-client/QR path (no client_id at all) is untouched, and
  // staff can still book on behalf of any client as before.
  if (clientId && !(await isStaffRequest(request))) {
    const sessionClientId = await getClientSession(request);
    if (sessionClientId !== clientId) {
      return NextResponse.json({ error: 'not authorized' }, { status: 403 });
    }
  }

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
      const extraIds = await clientIdsWithPhoneLike(supabase, `%${digits}%`);
      const orFilter =
        extraIds.length > 0 ? `phone.ilike.%${digits}%,id.in.(${extraIds.join(',')})` : `phone.ilike.%${digits}%`;
      const { data: matches } = await supabase.from('clients').select('id').or(orFilter);
      if (matches && matches.length === 1) {
        clientId = matches[0].id;
      }
    }
  }

  const { data, error } = await supabaseAdmin
    .from('intake_requests')
    .insert([{ sent_to_phone: body.sent_to_phone || null, client_id: clientId }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
