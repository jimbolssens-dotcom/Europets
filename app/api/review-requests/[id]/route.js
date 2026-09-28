// app/api/review-requests/[id]/route.js
// GET    /api/review-requests/:id  -> fetch one request — used by staff and
//                                      (via the website's own API route) the
//                                      public submission form
// PATCH  /api/review-requests/:id  -> { action: 'submit', rating, comment,
//                                      display_name }   the client filling
//                                      in and submitting the public form, or
//                                      { action: 'approve' | 'reject' }
//                                      staff moderating a submission before
//                                      it can show up on the public site
// DELETE /api/review-requests/:id  -> cancel an unused link

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('review_requests')
    .select('*, clients(id, full_name), patients(id, name)')
    .eq('id', params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: 'review request not found' }, { status: 404 });
  }
  return NextResponse.json(data);
}

// Photos are required (migration 152) but this route is never actually
// reached by the live submission flow — the public form
// (website/app/reviews/submit/[id]) posts to its own separate route
// (website/app/api/review-requests/[id]) instead, precisely so the
// server-only Supabase key never needs to be near a 'use client' file
// (see that route's own comment). Kept in sync here anyway so this route
// doesn't silently drift into accepting a photo-less review if it's ever
// used for something else later (a staff-side test, a future admin tool).
async function submit(id, body) {
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'a rating from 1 to 5 is required' }, { status: 400 });
  }
  const photoUrls = Array.isArray(body.photo_urls) ? body.photo_urls.filter((u) => typeof u === 'string' && u).slice(0, 2) : [];
  if (photoUrls.length === 0) {
    return NextResponse.json({ error: 'at least one photo is required' }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabase
    .from('review_requests')
    .select('status')
    .eq('id', id)
    .single();
  if (existingError || !existing) {
    return NextResponse.json({ error: 'review request not found' }, { status: 404 });
  }
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: 'this link has already been submitted' }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin
    .from('review_requests')
    .update({
      rating,
      comment: body.comment?.trim() || null,
      display_name: body.display_name?.trim() || null,
      photo_urls: photoUrls,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

async function review(id, action) {
  const { data: existing, error: existingError } = await supabase
    .from('review_requests')
    .select('status')
    .eq('id', id)
    .single();
  if (existingError || !existing) {
    return NextResponse.json({ error: 'review request not found' }, { status: 404 });
  }
  if (existing.status !== 'submitted') {
    return NextResponse.json({ error: 'only a submitted request can be reviewed' }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin
    .from('review_requests')
    .update({ status: action === 'approve' ? 'approved' : 'rejected', reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function PATCH(request, { params }) {
  const body = await request.json();

  if (body.action === 'submit') return submit(params.id, body);
  if (body.action === 'approve' || body.action === 'reject') return review(params.id, body.action);

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}

export async function DELETE(request, { params }) {
  const { error } = await supabaseAdmin.from('review_requests').delete().eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
