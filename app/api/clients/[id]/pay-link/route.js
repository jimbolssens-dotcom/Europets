// app/api/clients/[id]/pay-link/route.js
// Staff only (middleware.js gates every path not in its public patterns).
// GET  -> the client's personal payment link (migration 213), if any, its
//         URL, and their credit (money paid in with nothing left to pay).
// POST { patient_id?, fresh?, staff_id? } -> the link, made if there isn't
//         one; fresh turns the old one off and makes a new one; patient_id
//         sets the pet it's shown as for (null for none).

import { NextResponse } from 'next/server';
import { activePayLink, getOrCreatePayLink, presentPayLink } from '@/lib/clientPayLinks';
import { drawPayPagePictures } from '@/lib/payLinkPages';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { clientCreditBalance } from '@/lib/clientCredit';

export const dynamic = 'force-dynamic';

function present(link, credit) {
  return { link: presentPayLink(link), credit: credit ?? 0 };
}

export async function GET(request, { params }) {
  const [{ data: link, error }, { credit }] = await Promise.all([activePayLink(params.id), clientCreditBalance(params.id)]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(present(link, credit), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const { data: link, error } = await getOrCreatePayLink(params.id, {
    patientId: 'patient_id' in body ? body.patient_id || null : undefined,
    staffId: body.staff_id || null,
    fresh: body.fresh === true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // A new link's Story picture shows the new address: draw it again.
  let shown = link;
  if (body.fresh === true && link.page_photo_path) {
    const pictures = await drawPayPagePictures(link).catch(() => null);
    if (pictures) {
      await supabaseAdmin.from('client_payment_links').update(pictures).eq('id', link.id);
      shown = { ...link, ...pictures };
    }
  }
  const { credit } = await clientCreditBalance(params.id);
  return NextResponse.json(present(shown, credit));
}
