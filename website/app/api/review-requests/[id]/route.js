// app/api/review-requests/[id]/route.js
// GET   -> fetch just enough about one review request for the public
//           submission page to greet the client and pet, and check the
//           link's status (never exposes phone numbers or internal ids
//           beyond this one row's own id).
// POST  -> the client submitting the form, as multipart/form-data (not
//           JSON) since it always carries 1-2 required photos (migration
//           152) alongside rating/comment/display_name — see
//           app/reviews/submit/[id]. Mirrors the { action: 'submit' }
//           PATCH on the main app's own /api/review-requests/:id — kept
//           as a separate, minimal route here so this server-only
//           Supabase key (see lib/supabaseServer.js) never needs to be
//           anywhere near a 'use client' file.

import { supabaseServer } from '@/lib/supabaseServer';
import { supabaseServerAdmin } from '@/lib/supabaseServerAdmin';
import { NextResponse } from 'next/server';

const MAX_PHOTOS = 2;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function firstNameLastInitial(fullName) {
  if (!fullName) return null;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

// Same "random safe string + extension" reasoning as the main app's own
// lib/attachments.js#safeStorageFileName — an unpredictable real filename
// (emoji, odd whitespace, non-Latin script) can fail Storage's key
// validator outright, so nothing about the original name survives into
// the storage path.
function safeStorageFileName(originalName) {
  const dotIndex = originalName.lastIndexOf('.');
  const ext = dotIndex > 0 ? originalName.slice(dotIndex).replace(/[^A-Za-z0-9.]/g, '').slice(0, 10) : '';
  const random = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${random}${ext}`;
}

export async function GET(request, { params }) {
  const { data, error } = await supabaseServer
    .from('review_requests')
    .select('id, status, clients(full_name), patients(name)')
    .eq('id', params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({
    status: data.status,
    client_first_name: data.clients?.full_name?.split(' ')[0] || null,
    patient_name: data.patients?.name || null,
  });
}

export async function POST(request, { params }) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'invalid submission' }, { status: 400 });
  }

  const rating = Number(form.get('rating'));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'a rating from 1 to 5 is required' }, { status: 400 });
  }

  const photos = form.getAll('photos').filter((f) => f instanceof File && f.size > 0);
  if (photos.length === 0) {
    return NextResponse.json({ error: 'at least one photo is required' }, { status: 400 });
  }
  if (photos.length > MAX_PHOTOS) {
    return NextResponse.json({ error: `at most ${MAX_PHOTOS} photos` }, { status: 400 });
  }
  for (const photo of photos) {
    if (!photo.type.startsWith('image/')) {
      return NextResponse.json({ error: 'photos must be image files' }, { status: 400 });
    }
    if (photo.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: 'each photo must be under 8MB' }, { status: 400 });
    }
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

  // Uploaded (service-role key, same as the DB update below — review_requests
  // and this bucket's writes both need it, see lib/supabaseServerAdmin.js)
  // before touching the row, so a failed upload never leaves a
  // half-submitted review with no photo.
  const photoUrls = [];
  for (const photo of photos) {
    const path = `review-photos/${params.id}/${safeStorageFileName(photo.name)}`;
    const { error: uploadError } = await supabaseServerAdmin.storage
      .from('consult-files')
      .upload(path, photo, { contentType: photo.type });
    if (uploadError) {
      return NextResponse.json({ error: 'could not upload photo — please try again' }, { status: 500 });
    }
    const { data: urlData } = supabaseServerAdmin.storage.from('consult-files').getPublicUrl(path);
    photoUrls.push(urlData.publicUrl);
  }

  const typedDisplayName = String(form.get('display_name') || '').trim().slice(0, 100);
  // Left blank -> "Sarah K." style default, never the client's full name —
  // the submit form promises this, since a review is shown publicly.
  const displayName = typedDisplayName || firstNameLastInitial(existing.clients?.full_name) || 'A client';

  const { error } = await supabaseServerAdmin
    .from('review_requests')
    .update({
      rating,
      comment: String(form.get('comment') || '').trim().slice(0, 2000) || null,
      display_name: displayName,
      photo_urls: photoUrls,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: 'something went wrong, please try again' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
