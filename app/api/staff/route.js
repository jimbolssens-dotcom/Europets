// app/api/staff/route.js
// GET  /api/staff                -> list all staff
// GET  /api/staff?role=vet       -> list staff with a given role
// GET  /api/staff?active=true    -> list only active staff (for a
//                                    booking/assignment picker — see
//                                    staff.active, migration 108)
// POST /api/staff                -> create a new staff member ({ full_name,
//                                    role, email?, color?, whatsapp_phone?,
//                                    access_until? }); an intern with no
//                                    name gets "Intern N" (migration 223)

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { STAFF_ROLES, nextInternName } from '@/lib/staffRoles';
import { normalizeWhatsAppPhone } from '@/lib/teamChatPlan';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const role = searchParams.get('role');
  const active = searchParams.get('active');

  let query = supabase.from('staff').select('*').order('full_name', { ascending: true });
  if (role) {
    query = query.eq('role', role);
  }
  if (active === 'true') {
    query = query.eq('active', true);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { role, email, color, whatsapp_phone, access_until } = body;
  let full_name = String(body.full_name || '').trim();

  if (!role || !STAFF_ROLES.includes(role)) {
    return NextResponse.json({ error: `role must be one of ${STAFF_ROLES.join(', ')}` }, { status: 400 });
  }
  if (!full_name && role === 'intern') {
    const { data: all } = await supabaseAdmin.from('staff').select('full_name');
    full_name = nextInternName(all);
  }
  if (!full_name) return NextResponse.json({ error: 'full_name is required' }, { status: 400 });
  const phone = whatsapp_phone ? normalizeWhatsAppPhone(whatsapp_phone) : null;
  if (whatsapp_phone && !phone) return NextResponse.json({ error: 'That WhatsApp number does not look right. Use the full number, e.g. 050 123 4567.' }, { status: 400 });
  if (access_until && !/^\d{4}-\d{2}-\d{2}$/.test(access_until)) return NextResponse.json({ error: 'access_until must be a date' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('staff')
    .insert([{ full_name, role, email: email || null, color: color || null, whatsapp_phone: phone, access_until: access_until || null }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'That email or WhatsApp number is already on another staff member.' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
