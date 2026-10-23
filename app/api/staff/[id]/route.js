// app/api/staff/[id]/route.js
// GET    /api/staff/:id  -> a single staff member
// PATCH  /api/staff/:id  -> edit a staff member (including active, to
//                           deactivate instead of delete — see migration 108)
// DELETE /api/staff/:id  -> remove a staff member (blocked if referenced elsewhere)

import { publicStaff } from '@/lib/staffPublic';
import { normalizeWhatsAppPhone } from '@/lib/teamChatPlan';
import { STAFF_ROLES } from '@/lib/staffRoles';
import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

const VALID_ROLES = STAFF_ROLES;

export async function GET(request, { params }) {
  const { data, error } = await supabase.from('staff').select('*').eq('id', params.id).single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return NextResponse.json(Array.isArray(data) ? data.map(publicStaff) : publicStaff(data));
}

export async function PATCH(request, { params }) {
  const body = await request.json();
  const { full_name, role, email, color, active, whatsapp_phone, access_until } = body;

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
  if (active !== undefined) update.active = Boolean(active);
  // Temporary staff (migration 223): the last day they have access; empty clears it.
  if (access_until !== undefined) {
    if (access_until && !/^\d{4}-\d{2}-\d{2}$/.test(access_until)) return NextResponse.json({ error: 'access_until must be a date' }, { status: 400 });
    update.access_until = access_until || null;
  }
  // Their WhatsApp for the team chat (migration 220), as digits with the
  // country code; empty clears it.
  if (whatsapp_phone !== undefined) {
    const phone = whatsapp_phone ? normalizeWhatsAppPhone(whatsapp_phone) : null;
    if (whatsapp_phone && !phone) return NextResponse.json({ error: 'That WhatsApp number does not look right. Use the full number, e.g. 050 123 4567.' }, { status: 400 });
    update.whatsapp_phone = phone;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('staff')
    .update(update)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Another staff member already has that WhatsApp number.' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(Array.isArray(data) ? data.map(publicStaff) : publicStaff(data));
}

export async function DELETE(request, { params }) {
  const { error } = await supabaseAdmin.from('staff').delete().eq('id', params.id);

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
