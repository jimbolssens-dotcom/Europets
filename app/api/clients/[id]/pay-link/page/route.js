// app/api/clients/[id]/pay-link/page/route.js
// Staff only (middleware.js gates every path not in its public patterns).
// POST { enabled, style, title, story, photo_path, links,
//        instagram_handle, show_supporters, show_bills, slug } -> saves the
//        client's personalised pay page (migrations 214, 216, 217,
//        lib/payLinkPages.js) on their live link (made if there isn't one),
//        draws the photo page's cover and Story pictures again when the
//        title, photo or short link changed, and fetches their Instagram.
//        Returns the link as GET ../ does.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getOrCreatePayLink, presentPayLink, PAY_LINK_FIELDS, cleanSlug } from '@/lib/clientPayLinks';
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
    // The clinic's photo page, or the rescuer's own Instagram page.
    page_style: body.style === 'instagram' ? 'instagram' : 'photo',
    page_title: cleanHeadline(body.title) || null,
    page_story: String(body.story || '').replace(/\s*[–—]\s*/g, ', ').trim().slice(0, 600) || null,
    // Only a photo uploaded for this page, or one of the clinic's own social files.
    page_photo_path: typeof body.photo_path === 'string' && body.photo_path.startsWith('social/') ? body.photo_path : null,
    // Their own links: a label and a web address each, at most five.
    page_links: (Array.isArray(body.links) ? body.links : [])
      .map((l) => ({ label: String(l?.label || '').trim().slice(0, 40), url: String(l?.url || '').trim().slice(0, 300) }))
      .map((l) => ({ ...l, url: /^https?:\/\//i.test(l.url) ? l.url : l.url ? `https://${l.url}` : '' }))
      .filter((l) => l.label && /^https?:\/\/[^\s]+\.[^\s]+/i.test(l.url))
      .slice(0, 5),
    instagram_handle: /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle : null,
    show_supporters: body.show_supporters !== false,
    show_bills: body.show_bills !== false,
    // Its short name (migration 216): epc.vet/pay/<slug>.
    slug: cleanSlug(body.slug),
    page_updated_at: new Date().toISOString(),
  };
  if (update.slug && update.slug !== link.slug) {
    const { data: taken } = await supabaseAdmin.from('client_payment_links').select('id').eq('slug', update.slug).neq('id', link.id).maybeSingle();
    if (taken) return NextResponse.json({ error: `epc.vet/pay/${update.slug} is already taken. Try another short name.` }, { status: 409 });
  }
  // The photo page's pictures (also the clinic's own page for them, the
  // website's app/rescues), whichever style their link shows.
  const redraw =
    (!!update.page_photo_path || !!link.page_cover_path) &&
    (update.page_title !== link.page_title || update.page_photo_path !== link.page_photo_path || update.slug !== link.slug || !link.page_cover_path);
  try {
    if (redraw) Object.assign(update, await drawPayPagePictures({ ...link, ...update }));
  } catch (err) {
    return NextResponse.json({ error: `Couldn't draw the pictures: ${err.message}` }, { status: 500 });
  }
  const { data: saved, error: saveError } = await supabaseAdmin.from('client_payment_links').update(update).eq('id', link.id).select(PAY_LINK_FIELDS).single();
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });
  const instagram = await refreshPayPageInstagram(saved, { force: saved.instagram_handle !== link.instagram_handle });
  const { credit } = await clientCreditBalance(params.id);
  return NextResponse.json({ link: presentPayLink({ ...saved, page_instagram: instagram }), credit: credit ?? 0 });
}
