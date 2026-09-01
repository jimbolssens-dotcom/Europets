// app/api/vaccine-protocols/[id]/route.js
// PATCH  /api/vaccine-protocols/:id  -> edit a protocol (incl. active toggle)
// DELETE /api/vaccine-protocols/:id  -> remove a protocol (blocked if used)

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const EDITABLE_FIELDS = ['name', 'species', 'core', 'interval_months', 'active'];

export async function PATCH(request, { params }) {
  const body = await request.json();
  const update = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) update[field] = body[field];
  }

  if (update.species && !['cat', 'dog'].includes(update.species)) {
    return NextResponse.json({ error: "species must be 'cat' or 'dog'" }, { status: 400 });
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('vaccine_protocols')
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
  const { error } = await supabase.from('vaccine_protocols').delete().eq('id', params.id);

  if (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        {
          error:
            'cannot delete this protocol — it has already been used on a vaccination record; deactivate it instead',
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
