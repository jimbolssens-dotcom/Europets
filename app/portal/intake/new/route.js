// app/portal/intake/new/route.js
// GET /portal/intake/new
//   -> creates a brand-new, blank new-client intake request and redirects
//      straight into its one-time form. This is the fixed URL a printed
//      QR code points to (see /api/new-client-qr) — since a single
//      intake_requests row can only ever be filled in once, every scan
//      needs its own fresh row, not a shared/reused link. Unlike POST
//      /api/intake-requests (used when staff send a link over WhatsApp),
//      there's no phone number to match against an existing client here —
//      a QR code scan is always the blank new-client form.
//
// A GET (not POST) so a phone camera opening the QR code's URL just works.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { data, error } = await supabase
    .from('intake_requests')
    .insert([{ sent_to_phone: null, client_id: null }])
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.redirect(new URL(`/portal/intake/${data.id}`, request.url));
}
