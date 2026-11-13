// app/api/signatures/[key]/route.js
// A vet's signature or stamp (key = their staff id, ?kind=signature|stamp),
// printed on prescriptions (migration 251). Staff only (behind
// the staff login in middleware.js).
// GET    -> the PNG, for the preview on the Staff page
// PUT    -> save it ({ data_url: "data:image/png;base64,..." }, already
//           cleaned in the browser by lib/inkImage.js)
// DELETE -> remove it

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { loadSignaturePng, parsePngDataUrl, pngSize, signatureKey } from '@/lib/signatureImages';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const key = signatureKey(params.key, new URL(request.url).searchParams.get('kind') || 'signature');
  if (!key) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const png = await loadSignaturePng(supabaseAdmin, key);
  if (!png) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return new NextResponse(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } });
}

export async function PUT(request, { params }) {
  const key = signatureKey(params.key, new URL(request.url).searchParams.get('kind') || 'signature');
  if (!key) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { data: s } = await supabaseAdmin.from('staff').select('id').eq('id', params.key).maybeSingle();
  if (!s) return NextResponse.json({ error: 'staff member not found' }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const parsed = parsePngDataUrl(body.data_url);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { width, height } = pngSize(parsed.bytes);
  const { error } = await supabaseAdmin
    .from('signature_images')
    .upsert({ key, png: parsed.base64, width, height, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, width, height });
}

export async function DELETE(request, { params }) {
  const key = signatureKey(params.key, new URL(request.url).searchParams.get('kind') || 'signature');
  if (!key) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { error } = await supabaseAdmin.from('signature_images').delete().eq('key', key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
