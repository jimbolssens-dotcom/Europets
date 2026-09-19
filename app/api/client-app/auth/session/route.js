// GET /api/client-app/auth/session -> { clientId } if the session cookie
// is present and valid, otherwise 401. Used by useClientAppSession on
// mount instead of just reading localStorage — the cookie is httpOnly so
// this is the only way client-side code can find out who (if anyone) is
// logged in.

import { NextResponse } from 'next/server';
import { getClientSession } from '@/lib/clientAppAuth';

export async function GET(request) {
  const clientId = await getClientSession(request);
  if (!clientId) {
    return NextResponse.json({ error: 'not logged in' }, { status: 401 });
  }
  return NextResponse.json({ clientId });
}
