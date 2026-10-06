// app/api/cattery/availability/route.js
// GET /api/cattery/availability?date_in=YYYY-MM-DD&date_out=YYYY-MM-DD
//   -> { taken: [space numbers] } for the client app's space picker
//      (app/client-app/cattery/new). Staff or a logged-in client only (the
//      path is open GET-only in middleware.js CLIENT_APP_READ_PATTERNS; this
//      route does the real check). Only says which spaces are taken, never
//      whose cat is in them. Pending requests count as taken.

import { isStaffRequest } from '@/lib/staffAuth';
import { getClientSession } from '@/lib/clientAppAuth';
import { expireStaleRequests, takenSpaces } from '@/lib/catteryServer';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (!(await isStaffRequest(request)) && !(await getClientSession(request))) {
    return NextResponse.json({ error: 'not authorized' }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const dateIn = searchParams.get('date_in');
  const dateOut = searchParams.get('date_out');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIn || '') || !/^\d{4}-\d{2}-\d{2}$/.test(dateOut || '') || dateOut < dateIn) {
    return NextResponse.json({ error: 'Pick a date in and a date out.' }, { status: 400 });
  }
  await expireStaleRequests();
  return NextResponse.json({ taken: await takenSpaces(dateIn, dateOut) }, { headers: { 'Cache-Control': 'no-store' } });
}
