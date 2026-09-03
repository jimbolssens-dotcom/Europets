// app/api/staff-roster/[id]/route.js
// DELETE /api/staff-roster/:id -> remove a staff member from a date+shift
// (taking themselves off the roster, or an admin/another staff member
// clearing it).

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function DELETE(request, { params }) {
  const { error } = await supabase.from('staff_roster_entries').delete().eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
