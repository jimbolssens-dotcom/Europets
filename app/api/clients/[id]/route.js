// app/api/clients/[id]/route.js
// GET    /api/clients/:id  -> a single client, with its phone numbers (client_phones)
// PATCH  /api/clients/:id  -> edit a client — pass `phones` to replace their whole
//                             phones list (see lib/clientPhones); omit it to leave
//                             their numbers untouched
// DELETE /api/clients/:id  -> remove a client (blocked if they/their patients have history)

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { normalizeClientPhones, syncClientWhatsappPhone } from '@/lib/clientPhones';

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('clients')
    .select('*, client_phones(*)')
    .eq('id', params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function PATCH(request, { params }) {
  const body = await request.json();
  const { full_name, phones, emirates_id, trn, email, address } = body;

  const update = {};
  if (full_name !== undefined) update.full_name = full_name;
  if (emirates_id !== undefined) update.emirates_id = emirates_id || null;
  if (trn !== undefined) update.trn = trn || null;
  if (email !== undefined) update.email = email;
  if (address !== undefined) update.address = address;

  let normalizedPhones;
  if (phones !== undefined) {
    try {
      normalizedPhones = normalizeClientPhones(phones);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }

  if (Object.keys(update).length === 0 && normalizedPhones === undefined) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
  }

  if (normalizedPhones !== undefined) {
    // Replace the whole list rather than diffing individual rows — it's
    // always small, and this keeps the "exactly one WhatsApp number"
    // logic in one place (see normalizeClientPhones) instead of having to
    // reconcile partial updates against what's already there.
    const { error: deleteError } = await supabase.from('client_phones').delete().eq('client_id', params.id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
    if (normalizedPhones.length > 0) {
      const { error: insertError } = await supabase
        .from('client_phones')
        .insert(normalizedPhones.map((p) => ({ ...p, client_id: params.id })));
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }
    try {
      await syncClientWhatsappPhone(supabase, params.id, normalizedPhones);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  if (Object.keys(update).length > 0) {
    const { error: updateError } = await supabase.from('clients').update(update).eq('id', params.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  const { data, error } = await supabase
    .from('clients')
    .select('*, client_phones(*)')
    .eq('id', params.id)
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
