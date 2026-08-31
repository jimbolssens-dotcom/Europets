// app/api/rooms/[id]/route.js
// PATCH  /api/rooms/:id  -> edit a room
// DELETE /api/rooms/:id  -> remove a room (blocked if it has appointments/visits)

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function PATCH(request, { params }) {
  const body = await request.json();
  const { name, type } = body;

  if (type && !['consult', 'surgery'].includes(type)) {
    return NextResponse.json(
      { error: "type must be 'consult' or 'surgery'" },
      { status: 400 }
    );
  }

  const update = {};
  if (name !== undefined) update.name = name;
  if (type !== undefined) update.type = type;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('rooms')
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
  const { error } = await supabase.from('rooms').delete().eq('id', params.id);

  if (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        { error: 'cannot delete this room — it has existing appointments or visits' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
