// app/api/clients/[id]/pay-link/page/route.js
// Staff only (middleware.js gates every path not in its public patterns).
// POST { enabled, title, story, photo_path, instagram_handle,
//        show_supporters, show_bills } -> saves the client's personalised
//        pay page (migration 214, lib/payLinkPages.js) on their live link
//        (made if there isn't one), draws its cover and Story pictures
//        again when the title or photo changed, and fetches their
//        Instagram. Returns the link as GET ../ does.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getOrCreatePayLink, presentPayLink, PAY_LINK_FIELDS } from '@/lib/clientPayLinks';
import { drawPayPagePictures, refreshPayPageInstagram } from '@/lib/payLinkPages';
import { clientCreditBalance } from '@/lib/clientCredit';
import { cleanHeadline } from '@/lib/socialCoverLayout';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const { data: link, error } = await getOrCreatePayLink(params.id, {});
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const handle = String(body.instagram_handle || '').replace(/^@/, '').trim();
  const update = {
    page_enabled: body.enabled === true,
    page_title: cleanHeadline(body.title) || null,
    page_story: String(body.story || '').replace(/\s*[–—]\s*/g, ', ').trim().slice(0, 600) || null,
    // Only a photo uploaded for this page, or one of the clinic's own social files.
    page_photo_path: typeof body.photo_path === 'string' && body.photo_path.startsWith('social/') ? body.photo_path : null,
    instagram_handle: /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle : null,
    show_supporters: body.show_supporters !== false,
    show_bills: body.show_bills !== false,
    page_updated_at: new Date().toISOString(),
  };
  const redraw = update.page_title !== link.page_title || update.page_photo_path !== link.page_photo_path || !link.page_cover_path;
  let next = { ...link, ...update };
  try {
    if (redraw) Object.assign(update, await drawPayPagePictures(next));
  } catch (err) {
    return NextResponse.json({ error: `Couldn't draw the pictures: ${err.message}` }, { status: 500 });
  }
  const { data: saved, error: saveError } = await supabaseAdmin.from('client_payment_links').update(update).eq('id', link.id).select(PAY_LINK_FIELDS).single();
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });
  next = saved;
  const instagram = await refreshPayPageInstagram(next, { force: next.instagram_handle !== link.instagram_handle });
  const { credit } = await clientCreditBalance(params.id);
  return NextResponse.json({ link: presentPayLink({ ...next, page_instagram: instagram }), credit: credit ?? 0 });
}
