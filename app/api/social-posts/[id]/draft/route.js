// app/api/social-posts/[id]/draft/route.js
// POST -> have the AI (re)draft this post's captions from its photos
// (lib/socialDraft.js). Also the "↻ Redo" button.

import { NextResponse } from 'next/server';
import { draftSocialPost } from '@/lib/socialDraft';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request, { params }) {
  const result = await draftSocialPost(params.id);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status || 500 });
  return NextResponse.json({ ok: true });
}
