// app/api/client-messages/[id]/to-social/route.js
// POST { patient_id, staff_id } -> turns a photo a client sent on WhatsApp
// into a Social post draft (migration 202): the photo is copied into the
// post's own folder (social/<id>/, so deleting the post never blanks the
// chat), a small copy is made for the AI, and the AI drafts the captions
// (lib/socialDraft.js). Returns { id }; the page opens /social/<id>.
//
// The owner's 📸 Social consent still decides whether it can be approved
// (lib/socialPosts.js); a "no" stops it here already. Staff-only: not in
// middleware.js's public patterns.

import sharp from 'sharp';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { draftSocialPost } from '@/lib/socialDraft';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUCKET = 'consult-files';

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const { data: message } = await supabaseAdmin
    .from('client_messages')
    .select('id, client_id, sender, media_url, media_type, body')
    .eq('id', params.id)
    .maybeSingle();
  if (!message?.media_url || message.media_type !== 'image') {
    return NextResponse.json({ error: 'Only a photo can be sent to Social from here.' }, { status: 400 });
  }

  const patientId = body.patient_id || null;
  if (patientId) {
    const { data: patient } = await supabaseAdmin
      .from('patients')
      .select('id, client_id, clients(social_media_consent)')
      .eq('id', patientId)
      .maybeSingle();
    if (!patient || patient.client_id !== message.client_id) {
      return NextResponse.json({ error: "That pet isn't this client's." }, { status: 400 });
    }
    if (patient.clients?.social_media_consent === false) {
      return NextResponse.json({ error: "This owner said no to social media, so their pet can't be posted." }, { status: 409 });
    }
  }

  const res = await fetch(message.media_url);
  if (!res.ok) return NextResponse.json({ error: 'Could not read the photo.' }, { status: 502 });
  const original = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || 'image/jpeg';

  const caption = String(message.body || '').trim();
  const { data: post, error } = await supabaseAdmin
    .from('social_posts')
    .insert([
      {
        story: `The owner sent this photo on WhatsApp${caption ? `, saying: "${caption.slice(0, 300)}"` : ''}.`,
        patient_id: patientId,
        created_by: body.staff_id || null,
      },
    ])
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const ext = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';
  const path = `social/${post.id}/whatsapp-${stamp}${ext}`;
  const previewPath = `social/${post.id}/preview-${stamp}.jpg`;
  try {
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, original, { contentType });
    if (upErr) throw new Error(upErr.message);
    const preview = await sharp(original).rotate().resize({ width: 1568, height: 1568, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const { error: pvErr } = await supabaseAdmin.storage.from(BUCKET).upload(previewPath, preview, { contentType: 'image/jpeg' });
    if (pvErr) throw new Error(pvErr.message);
  } catch (err) {
    await supabaseAdmin.from('social_posts').update({ status: 'discarded' }).eq('id', post.id);
    return NextResponse.json({ error: `Could not copy the photo: ${err.message}` }, { status: 500 });
  }

  await supabaseAdmin
    .from('social_posts')
    .update({ media: [{ path, preview_path: previewPath, kind: 'image', name: 'WhatsApp photo' }], updated_at: new Date().toISOString() })
    .eq('id', post.id);

  // The draft can fail (AI busy): the post is still there and Redo retries.
  const drafted = await draftSocialPost(post.id);
  return NextResponse.json({ id: post.id, draft_error: drafted.error || null }, { status: 201 });
}
