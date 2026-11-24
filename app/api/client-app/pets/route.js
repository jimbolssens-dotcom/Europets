// app/api/client-app/pets/route.js
// POST -> a logged-in client adds a pet of their own (Jim, 24 Nov;
// migration 262). On file straight away under their account, marked
// added_by_client_at so staff see "Added by the client" and can check it
// at the first visit. Checked by lib/clientNewPet.js.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getClientSession } from '@/lib/clientAppAuth';
import { clientNewPet } from '@/lib/clientNewPet';

export async function POST(request) {
  const clientId = await getClientSession(request);
  if (!clientId) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const today = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: pet, error: checkError } = clientNewPet(body, today);
  if (checkError) return NextResponse.json({ error: checkError }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('patients')
    .insert([{ ...pet, client_id: clientId, added_by_client_at: new Date().toISOString() }])
    .select('id, name, patient_number')
    .single();
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'That microchip number is already on file. Please check it, or message us.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Could not add your pet. Please try again.' }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
