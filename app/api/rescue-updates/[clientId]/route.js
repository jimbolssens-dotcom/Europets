// app/api/rescue-updates/[clientId]/route.js
// Staff only, like the rest of /api.
// POST { action: 'start', staff_id? } -> today's update post for this
//        partner (migration 218), made if there isn't one: upload photos into
//        it (lib/socialUpload.js).
// POST { action: 'photo', post_id, patient_id, media } -> that uploaded
//        photo as this animal's photo today (replacing an earlier one).
// Then /api/social-posts/<id>/draft writes it, and it's approved on the
// Social page as usual.

import { NextResponse } from 'next/server';
import { getPartner, getOrCreateTodayPost, setCasePhoto, rescueDay } from '@/lib/rescueUpdates';
import { markDutyDone } from '@/lib/socialDuty';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const partner = await getPartner(params.clientId);
  if (!partner) return NextResponse.json({ error: 'Not a rescue partner (or no yes to social media on file)' }, { status: 404 });

  if (body.action === 'start') {
    const { data, error } = await getOrCreateTodayPost(partner, body.staff_id || null);
    if (error || !data) return NextResponse.json({ error: error?.message || 'Could not start the post' }, { status: 500 });
    // Today's update counts as today's Social post for whoever's turn it is.
    if (body.staff_id) await markDutyDone(body.staff_id, data.id);
    return NextResponse.json({ post_id: data.id });
  }

  if (body.action === 'photo') {
    const m = body.media || {};
    if (typeof m.path !== 'string' || !m.path.startsWith(`social/${body.post_id}/`)) return NextResponse.json({ error: 'That photo is not on this post' }, { status: 400 });
    const entry = { path: m.path, preview_path: typeof m.preview_path === 'string' ? m.preview_path : null, name: m.name || null };
    const result = await setCasePhoto(body.post_id, params.clientId, body.patient_id, entry);
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status || 500 });
    return NextResponse.json(await rescueDay(partner));
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
