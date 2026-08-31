// app/api/clients/[id]/route.js
// GET    /api/clients/:id  -> a single client
// PATCH  /api/clients/:id  -> edit a client
// DELETE /api/clients/:id  -> remove a client (blocked if they/their patients have history)

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function PATCH(request, { params }) {
  const body = await request.json();
  const { full_name, phone, phone2, phone2_label, emirates_id, email, address } = body;

  const update = {};
  if (full_name !== undefined) update.full_name = full_name;
  if (phone !== undefined) update.phone = phone;
  if (phone2 !== undefined) {
    update.phone2 = phone2 || null;
    update.phone2_label = phone2 ? phone2_label || null : null;
  } else if (phone2_label !== undefined) {
    update.phone2_label = phone2_label || null;
  }
  if (emirates_id !== undefined) update.emirates_id = emirates_id || null;
  if (email !== undefined) update.email = email;
  if (address !== undefined) update.address = address;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('clients')
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
  // attachments (e.g. scanned Emirates ID photos) link generically via
  // entity_type/entity_id, not a real FK, so they don't cascade — clean
  // them up explicitly before the delete attempt.
  const { data: attachments } = await supabase
    .from('attachments')
    .select('id, file_path')
    .eq('entity_type', 'client')
    .eq('entity_id', params.id);

  if (attachments?.length) {
    await supabase.storage.from('consult-files').remove(attachments.map((a) => a.file_path));
    await supabase.from('attachments').delete().in('id', attachments.map((a) => a.id));
  }

  const { error } = await supabase.from('clients').delete().eq('id', params.id);

  if (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        {
          error:
            'cannot delete this client — they (or their patients) have existing appointments, visits, or invoices',
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
