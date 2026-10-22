// app/api/rescue-updates/route.js
// GET -> today's daily rescue updates (migration 218, lib/rescueUpdates.js):
//        each partner with their animals in hospital, which have today's
//        photo, and today's post if it's started.
// Staff only, like the rest of /api.

import { NextResponse } from 'next/server';
import { activePartners, rescueDay } from '@/lib/rescueUpdates';

export const dynamic = 'force-dynamic';

export async function GET() {
  const partners = await activePartners();
  const days = await Promise.all(partners.map((p) => rescueDay(p)));
  return NextResponse.json({ partners: days }, { headers: { 'Cache-Control': 'no-store' } });
}
