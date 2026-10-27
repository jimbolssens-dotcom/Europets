// app/api/whatsapp/app-invite-sweep/route.js
// GET -> invites clients who wrote to us on WhatsApp, and have never opened
// the client app, to use it (migration 232, rules and wording in
// lib/appInvite.js). Vercel Cron every 15 minutes in clinic hours
// (vercel.json); public in middleware.js, verified with the same
// CRON_SECRET as the other cron routes. The invite is logged in the thread
// as an automated clinic message, so staff see it and the concierge knows
// what was sent if the client replies about it.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isWhatsAppConfigured, sendWhatsAppText } from '@/lib/metaWhatsapp';
import { greetingName } from '@/lib/greetingName';
import { inviteDecision, appInviteText, WINDOW_HOURS } from '@/lib/appInvite';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const appUrl = () => (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://portal.epc.vet').replace(/\/+$/, '');

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isWhatsAppConfigured()) return NextResponse.json({ skipped: 'WhatsApp is not configured' });
  const dryRun = new URL(request.url).searchParams.get('dry') === '1';

  const since = new Date(Date.now() - WINDOW_HOURS * 3600000).toISOString();
  const { data: recent, error } = await supabaseAdmin
    .from('client_messages')
    .select('client_id')
    .eq('channel', 'whatsapp')
    .eq('sender', 'client')
    .not('client_id', 'is', null)
    .gte('created_at', since);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = [...new Set((recent || []).map((r) => r.client_id))];
  if (!ids.length) return NextResponse.json({ checked: 0, sent: [] });

  const { data: clients, error: clientsError } = await supabaseAdmin
    .from('clients')
    .select('id, full_name, phone, client_app_last_seen_at, app_invited_at, app_invite_count')
    .in('id', ids)
    .is('client_app_last_seen_at', null);
  if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 });

  const sent = [];
  const skipped = [];
  for (const client of clients || []) {
    try {
      const [{ data: rows }, { data: pets }, { data: state }] = await Promise.all([
        supabaseAdmin
          .from('client_messages')
          .select('sender, body, created_at, is_notice, phone')
          .eq('client_id', client.id)
          .eq('channel', 'whatsapp')
          .order('created_at', { ascending: false })
          .limit(40),
        supabaseAdmin.from('patients').select('name, deceased, rehomed').eq('client_id', client.id),
        supabaseAdmin.from('client_message_thread_state').select('flagged, escalated_at').eq('thread_key', client.id).maybeSingle(),
      ]);
      const thread = (rows || []).reverse();
      const living = (pets || []).filter((p) => !p.deceased && !p.rehomed);
      // Waiting on staff: handed over, and no one from the team has written since.
      const flagged = !!state?.flagged && !thread.some((r) => r.sender === 'staff' && (!state.escalated_at || r.created_at > state.escalated_at));
      const decision = inviteDecision({ client, rows: thread, livingPets: living.length, flagged });
      if (!decision.send) {
        skipped.push(decision.reason);
        continue;
      }
      // The number they wrote from.
      const phone = [...thread].reverse().find((r) => r.sender === 'client')?.phone || client.phone;
      const body = appInviteText({
        name: greetingName(client.full_name),
        petNames: living.map((p) => p.name),
        appUrl: appUrl(),
        repeat: (client.app_invite_count || 0) > 0,
      });
      if (dryRun) {
        sent.push({ client_id: client.id, body });
        continue;
      }
      // Claim it first, so an overlapping run can't send it twice.
      const { data: claimed } = await supabaseAdmin
        .from('clients')
        .update({ app_invited_at: new Date().toISOString(), app_invite_count: (client.app_invite_count || 0) + 1 })
        .eq('id', client.id)
        .eq('app_invite_count', client.app_invite_count || 0)
        .select('id');
      if (!claimed?.length) continue;
      const waMessageId = await sendWhatsAppText(String(phone).replace(/\D/g, ''), body);
      await supabaseAdmin.from('client_messages').insert([
        { client_id: client.id, phone, channel: 'whatsapp', sender: 'system', body, wa_message_id: waMessageId || null, status: 'sent' },
      ]);
      sent.push({ client_id: client.id });
    } catch (err) {
      console.error('App invite failed for one client', client.id, err);
      skipped.push(`error: ${err.message}`);
    }
  }
  const reasons = skipped.reduce((acc, r) => ({ ...acc, [r]: (acc[r] || 0) + 1 }), {});
  return NextResponse.json({ checked: (clients || []).length, sent, skipped: reasons, dryRun });
}
