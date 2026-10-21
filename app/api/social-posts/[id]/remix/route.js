// app/api/social-posts/[id]/remix/route.js
// Staff only (middleware.js gates every path not in its public patterns).
// POST { field, tone?, text, index? } -> { options: [three new versions] } of
// a caption, the cover text or a photo's speech bubble (lib/socialDraft.js,
// remixSocialText), for the remix buttons on the draft. Saves nothing.

import { NextResponse } from 'next/server';
import { remixSocialText } from '@/lib/socialDraft';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const result = await remixSocialText(params.id, {
    field: body.field,
    tone: body.tone || null,
    text: typeof body.text === 'string' ? body.text : '',
    index: Number.isInteger(body.index) ? body.index : undefined,
  });
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status || 500 });
  return NextResponse.json(result);
}
