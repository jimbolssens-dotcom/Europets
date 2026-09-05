// app/api/review-requests/[id]/route.js
// GET   -> fetch just enough about one review request for the public
//           submission page to greet the client and check the link's
//           status (never exposes phone numbers or internal ids beyond
//           this one row's own id).
// POST  -> the client submitting the form. Mirrors the { action: 'submit' }
//           PATCH on the main app's own /api/review-requests/:id — kept as
//           a separate, minimal route here so this server-only Supabase
//           key (see lib/supabaseServer.js) never needs to be anywhere
//           near a 'use client' file.

import { supabaseServer } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

function firstNameLastInitial(fullName) {
  if (!fullName) return null;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export async function GET(request, { params }) {
  const { data, error } = await supabaseServer
    .from('review_requests')
    .select('id, status, clients(full_name)')
    .eq('id', params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({
    status: data.status,
    client_first_name: data.clients?.full_name?.split(' ')[0] || null,
  });
}

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const rating = Number(body.rating);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'a rating from 1 to 5 is required' }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabaseServer
    .from('review_requests')
    .select('status, clients(full_name)')
    .eq('id', params.id)
    .single();
  if (existingError || !existing) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: 'this link has already been submitted' }, { status: 409 });
  }

  const typedDisplayName = typeof body.display_name === 'string' ? body.display_name.trim().slice(0, 100) : '';
  // Left blank -> "Sarah K." style default, never the client's full name —
  // the submit form promises this, since a review is shown publicly.
  const displayName = typedDisplayName || firstNameLastInitial(existing.clients?.full_name) || 'A client';

  const { error } = await supabaseServer
    .from('review_requests')
    .update({
      rating,
      comment: typeof body.comment === 'string' ? body.comment.trim().slice(0, 2000) || null : null,
      display_name: displayName,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: 'something went wrong — please try again' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
