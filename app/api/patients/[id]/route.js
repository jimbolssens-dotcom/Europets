// app/api/patients/[id]/route.js
// GET    /api/patients/:id  -> a single patient, with owner info
// PATCH  /api/patients/:id  -> edit a patient (including marking deceased)
// DELETE /api/patients/:id  -> remove a patient (blocked if it has appointments/visits)

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { isStaffRequest } from '@/lib/staffAuth';
import { getClientSession } from '@/lib/clientAppAuth';

const EDITABLE_FIELDS = [
  'name',
  'species',
  'breed',
  'color',
  'date_of_birth',
  'sex',
  'current_weight_kg',
  'microchip_number',
  'microchip_implanted_at',
  'deceased',
  'notes',
  'dental_chart',
  'profile_photo_url',
];

// All a non-staff caller (a logged-in client, editing their own pet from
// the client app) is ever allowed to touch — everything else in
// EDITABLE_FIELDS stays staff-only, even though this route is reachable
// without the staff PIN now (see middleware.js).
const CLIENT_EDITABLE_FIELDS = ['profile_photo_url'];

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('patients')
    .select('*, clients(id, client_number, full_name, phone, email)')
    .eq('id', params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (!(await isStaffRequest(request))) {
    const sessionClientId = await getClientSession(request);
    if (!sessionClientId || sessionClientId !== data.client_id) {
      return NextResponse.json({ error: 'not authorized' }, { status: 403 });
    }
  }
  return NextResponse.json(data);
}

export async function PATCH(request, { params }) {
  const body = await request.json();
  const staff = await isStaffRequest(request);

  if (!staff) {
    const sessionClientId = await getClientSession(request);
    const { data: owner } = await supabase.from('patients').select('client_id').eq('id', params.id).single();
    if (!sessionClientId || !owner || sessionClientId !== owner.client_id) {
      return NextResponse.json({ error: 'not authorized' }, { status: 403 });
    }
    const attemptedStaffOnlyField = Object.keys(body).some((field) => !CLIENT_EDITABLE_FIELDS.includes(field));
    if (attemptedStaffOnlyField) {
      return NextResponse.json({ error: 'not authorized to edit those fields' }, { status: 403 });
    }
  }

  const update = {};
  const allowedFields = staff ? EDITABLE_FIELDS : CLIENT_EDITABLE_FIELDS;
  for (const field of allowedFields) {
    if (body[field] === undefined) continue;
    // microchip_number is `text unique` — a plain "not provided" NULL lets
    // any number of patients go unchipped, but an empty string is a real
    // value, so two blanked-out patients would collide on '' and get
    // rejected as duplicates of each other. Normalize blank to NULL here
    // the same way POST /api/patients already does.
    update[field] = field === 'microchip_number' && !body[field] ? null : body[field];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('patients')
    .update(update)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'that microchip number is already registered to another patient' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(request, { params }) {
  const { error } = await supabaseAdmin.from('patients').delete().eq('id', params.id);

  if (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        { error: 'cannot delete this patient — it has existing appointments or visits' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
