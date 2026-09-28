// app/api/intake-requests/cleanup-stale/route.js
// GET /api/intake-requests/cleanup-stale -> deletes blank intake_requests
// rows that were auto-created by a visit to /portal/intake/new (the QR
// code / website "Book an Appointment" link — see that route) but never
// got filled in or sent to anyone. That route now filters out known bot
// User-Agents, which stops most of these before they're ever created,
// but a genuine visitor who clicks "Book an Appointment" and then closes
// the tab still leaves one behind — this is the safety net for that,
// so staff never again have to hand-delete a pile of them from the
// Client Invites page's "Sent, Awaiting Submission" list.
//
// Deliberately scoped to status='pending' AND sent_to_phone IS NULL: a
// staff-sent WhatsApp invite always has a real phone number attached
// (see POST /api/intake-requests) and should sit there for as long as it
// takes the client to get around to it, however many days — this only
// ever touches the walk-in/QR/website-click flavor that was never
// actually sent to a specific person.
//
// Triggered once a day by Vercel Cron (see vercel.json), which signs its
// own requests with a Bearer token matching the CRON_SECRET project env
// var — anyone else calling this without it gets a 401. Same pattern as
// app/api/vaccinations/send-due-reminders.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

// A blank link is only actually abandoned once it's had a real chance to
// be used — a walk-in scanning the QR code at reception right now still
// needs a few minutes to fill in the form. 48 hours is generous room for
// that while still clearing out everything from an old crawl within a
// day or two of this running.
const STALE_HOURS = 48;

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('intake_requests')
    .delete()
    .eq('status', 'pending')
    .is('sent_to_phone', null)
    .is('client_id', null)
    .lt('created_at', cutoff)
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: data.length });
}
