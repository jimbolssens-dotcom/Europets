// app/api/client-messages/[id]/attach/route.js
// Filing a photo/file a client sent in a chat (usually WhatsApp: x-rays or
// lab results from another clinic) onto one of their pets' records.
//
// GET  -> where it can go: for each of the client's pets, an open hospital
//         stay or day procedure, plus their 5 most recent consults.
// POST { entity_type: 'visit' | 'hospitalization', entity_id }
//      -> copies the file in Storage and records it as an attachment of
//         that consult or stay, so it shows in that record's files (and,
//         for a stay, on the owner's portal page). A copy, not a second
//         pointer to the chat's file: deleting an attachment deletes its
//         Storage file (see DELETE /api/attachments/:id), which would
//         otherwise also blank the photo in the chat.
//
// Staff-only: not in middleware.js's public patterns.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

const BUCKET = 'consult-files';
const PUBLIC_PREFIX = `/storage/v1/object/public/${BUCKET}/`;

async function loadMessage(id) {
  const { data } = await supabaseAdmin
    .from('client_messages')
    .select('id, client_id, media_url, media_type, created_at')
    .eq('id', id)
    .maybeSingle();
  return data;
}

function storagePathOf(mediaUrl) {
  const i = (mediaUrl || '').indexOf(PUBLIC_PREFIX);
  return i === -1 ? null : decodeURIComponent(mediaUrl.slice(i + PUBLIC_PREFIX.length).split('?')[0]);
}

export async function GET(request, { params }) {
  const message = await loadMessage(params.id);
  if (!message?.media_url) return NextResponse.json({ error: 'That message has no file.' }, { status: 404 });

  const { data: pets } = await supabaseAdmin
    .from('patients')
    .select('id, name, species, deceased, rehomed')
    .eq('client_id', message.client_id)
    .order('name');
  const petIds = (pets || []).map((p) => p.id);
  if (petIds.length === 0) return NextResponse.json({ pets: [] });

  const [{ data: stays }, { data: visits }] = await Promise.all([
    supabaseAdmin
      .from('hospitalizations')
      .select('id, patient_id, kind, reason, admitted_at, status')
      .in('patient_id', petIds)
      .eq('status', 'admitted')
      .order('admitted_at', { ascending: false }),
    supabaseAdmin
      .from('visits')
      .select('id, patient_id, started_at, status')
      .in('patient_id', petIds)
      .order('started_at', { ascending: false })
      .limit(petIds.length * 5),
  ]);

  const result = (pets || [])
    .filter((p) => !p.deceased && !p.rehomed)
    .map((p) => ({
      id: p.id,
      name: p.name,
      species: p.species,
      stays: (stays || []).filter((s) => s.patient_id === p.id),
      visits: (visits || []).filter((v) => v.patient_id === p.id).slice(0, 5),
    }));
  return NextResponse.json({ pets: result });
}

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const { entity_type, entity_id, uploaded_by } = body;
  if (!['visit', 'hospitalization'].includes(entity_type) || !entity_id) {
    return NextResponse.json({ error: 'Pick a consult or hospital stay.' }, { status: 400 });
  }

  const message = await loadMessage(params.id);
  if (!message?.media_url) return NextResponse.json({ error: 'That message has no file.' }, { status: 404 });
  const sourcePath = storagePathOf(message.media_url);
  if (!sourcePath) return NextResponse.json({ error: 'That file is not stored with us, so it cannot be filed.' }, { status: 400 });

  // The target must belong to one of this client's pets.
  const table = entity_type === 'visit' ? 'visits' : 'hospitalizations';
  const { data: target } = await supabaseAdmin
    .from(table)
    .select('id, patient_id, patients(name, client_id)')
    .eq('id', entity_id)
    .maybeSingle();
  if (!target || target.patients?.client_id !== message.client_id) {
    return NextResponse.json({ error: "That record isn't one of this client's pets." }, { status: 400 });
  }

  const ext = (sourcePath.match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0] || (message.media_type === 'image' ? '.jpg' : '');
  const destPath = `${entity_type}/${entity_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const { error: copyError } = await supabaseAdmin.storage.from(BUCKET).copy(sourcePath, destPath);
  if (copyError) return NextResponse.json({ error: `Could not copy the file: ${copyError.message}` }, { status: 500 });

  const sentOn = new Date(message.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' });
  const kind = message.media_type === 'image' ? 'Photo' : 'File';
  const { data: attachment, error } = await supabaseAdmin
    .from('attachments')
    .insert([
      {
        entity_type,
        entity_id,
        file_path: destPath,
        file_name: `${kind} sent by the owner on ${sentOn}${ext}`,
        content_type: message.media_type === 'image' ? 'image/jpeg' : null,
        uploaded_by: uploaded_by || null,
      },
    ])
    .select()
    .single();
  if (error) {
    await supabaseAdmin.storage.from(BUCKET).remove([destPath]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ attachment, patient_name: target.patients?.name });
}
