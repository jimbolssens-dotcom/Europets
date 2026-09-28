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
//
// This URL is also the website's own "Book an Appointment" button
// (BOOKING_URL in website/lib/content.js), a plain <a href> on nearly
// every page — which search-engine crawlers indexing the site, and
// link-preview bots fetching it whenever the page gets shared, hit
// constantly. Every one of those created its own permanent blank
// intake_requests row (nobody's actually there to fill in the form),
// which is what was flooding "Sent, Awaiting Submission" on the Client
// Invites page with rows nobody ever sent. A real phone camera scanning
// the QR code or a real browser clicking "Book an Appointment" never
// sends a bot-flavored User-Agent, so filtering those out by header
// stops the row from ever being created — a real visitor just sees a
// blank form either way, and a bot gets a plain 200 with nothing to
// index or preview.
const BOT_USER_AGENT_RE =
  /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegrambot|slackbot|discordbot|linkedinbot|twitterbot|pinterest|embedly|quora link preview|redditbot|skypeuripreview|iframely|w3c_validator|preview/i;

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const userAgent = request.headers.get('user-agent') || '';
  if (BOT_USER_AGENT_RE.test(userAgent)) {
    return new NextResponse('Europets Veterinary Clinic', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  const { data, error } = await supabaseAdmin
    .from('intake_requests')
    .insert([{ sent_to_phone: null, client_id: null }])
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Forward query params as-is — specifically ?src=web (see BOOKING_URL in
  // the website's lib/content.js), which the intake page reads to decide
  // whether to show its own website nav bar. A QR-code scan or any other
  // plain link here just won't carry it, so the nav bar stays off by
  // default, same as a WhatsApp-sent link.
  const target = new URL(`/portal/intake/${data.id}`, request.url);
  target.search = new URL(request.url).search;
  return NextResponse.redirect(target);
}
