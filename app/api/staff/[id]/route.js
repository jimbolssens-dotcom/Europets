// app/api/staff/[id]/route.js
// GET    /api/staff/:id  -> a single staff member
// PATCH  /api/staff/:id  -> edit a staff member
// DELETE /api/staff/:id  -> remove a staff member (blocked if referenced elsewhere)

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const VALID_ROLES = ['vet', 'tech', 'reception', 'admin'];

export async function GET(request, { params }) {
  const { data, error } = await supabase.from('staff').select('*').eq('id', params.id).single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function PATCH(request, { params }) {
  const body = await request.json();
  const { full_name, role, email, color } = body;

  if (role && !VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of ${VALID_ROLES.join(', ')}` },
      { status: 400 }
    );
  }

  const update = {};
  if (full_name !== undefined) update.full_name = full_name;
  if (role !== undefined) update.role = role;
  if (email !== undefined) update.email = email;
  if (color !== undefined) update.color = color || null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('staff')
    .update(update)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(request, { params }) {
  const { error } = await supabase.from('staff').delete().eq('id', params.id);

  if (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        {
          error:
            'cannot delete this staff member — they have existing appointments, visits, or notes',
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
