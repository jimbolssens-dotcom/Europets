// app/api/clients/[id]/pay-link/write/route.js
// Staff only (middleware.js gates every path not in its public patterns).
// POST { line } -> { title, story }: the AI's words for the client's
// personalised pay page (lib/socialDraft.js, writePayPageCopy). Saves
// nothing: they go in the fields for staff to change.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { writePayPageCopy } from '@/lib/socialDraft';
import { activePayLink } from '@/lib/clientPayLinks';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const [{ data: client }, { count }, { data: link }] = await Promise.all([
    supabaseAdmin.from('clients').select('full_name').eq('id', params.id).maybeSingle(),
    supabaseAdmin.from('patients').select('id', { count: 'exact', head: true }).eq('client_id', params.id),
    activePayLink(params.id),
  ]);
  if (!client) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const result = await writePayPageCopy({
    line: String(body.line || '').slice(0, 500),
    firstName: client.full_name?.trim().split(/\s+/)[0] || null,
    animals: count || null,
    instagramBio: link?.page_instagram?.biography || null,
  });
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status || 500 });
  return NextResponse.json(result);
}
