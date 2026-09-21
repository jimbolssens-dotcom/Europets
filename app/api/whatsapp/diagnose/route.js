// app/api/whatsapp/diagnose/route.js
// GET /api/whatsapp/diagnose -> a temporary, staff-gated troubleshooting
// endpoint for "the webhook responds 200 to Meta but no message shows up
// in /messages". The webhook route (see app/api/whatsapp/webhook) never
// fails its response to Meta on a DB error — it just logs and still
// acks — so from Meta's side everything looks fine even if the insert is
// silently failing (e.g. migrations/130_client_messages_whatsapp.sql
// hasn't actually been run, so the channel/phone/wa_message_id/status
// columns don't exist yet). This does the same insert the webhook does,
// against a throwaway row, and reports the exact Postgres error instead
// of swallowing it — so the real cause shows up in a browser instead of
// requiring Supabase or Vercel log access.
//
// Also checks migrations/131's media_url/media_type columns — GET
// /api/client-messages (the whole /messages inbox list) selects
// media_type unconditionally, so a missing column there doesn't just
// break photos, it 500s that query and blanks the entire inbox for every
// conversation, WhatsApp and app-chat alike (the same "everything looks
// fine except nothing shows up" shape as the migrations/130 gap this
// endpoint was first built for).
//
// Also reports whether the WhatsApp AI concierge (lib/whatsappConcierge.js)
// is actually switched on end to end — both the WHATSAPP_AI_ENABLED env
// var AND migrations/132's 'ai' sender value, since the concierge would
// otherwise silently fail every reply attempt (send succeeds, but logging
// it errors on the sender check constraint) with nothing visible to Meta
// or the client either way.
//
// Safe to leave in place — every call inserts then immediately deletes
// its own row, and it's staff-gated like any other non-public route.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export async function GET() {
  const report = {};

  // 1. Do the new columns from migrations/130 actually exist?
  const columnsCheck = await supabaseAdmin
    .from('client_messages')
    .select('channel, phone, wa_message_id, status')
    .limit(1);
  report.columns_exist = !columnsCheck.error;
  if (columnsCheck.error) report.columns_error = columnsCheck.error.message;

  // 1b. Same check for migrations/131's media columns — see note above.
  const mediaColumnsCheck = await supabaseAdmin
    .from('client_messages')
    .select('media_url, media_type')
    .limit(1);
  report.media_columns_exist = !mediaColumnsCheck.error;
  if (mediaColumnsCheck.error) report.media_columns_error = mediaColumnsCheck.error.message;

  // 2. Is client_id actually nullable? (migrations/130 also does `alter
  // column client_id drop not null` — a partial run could add the columns
  // but miss this, or vice versa.)
  const insertResult = await supabaseAdmin
    .from('client_messages')
    .insert([
      {
        phone: '00000000000',
        channel: 'whatsapp',
        sender: 'client',
        body: '[diagnostic test row — safe to ignore/delete]',
      },
    ])
    .select('id')
    .single();

  report.insert_ok = !insertResult.error;
  if (insertResult.error) {
    report.insert_error = insertResult.error.message;
    report.insert_error_code = insertResult.error.code;
  } else {
    // Clean up immediately — this row has no purpose beyond the test.
    await supabaseAdmin.from('client_messages').delete().eq('id', insertResult.data.id);
  }

  // 3. Is the concierge switched on end to end?
  report.whatsapp_ai_enabled = process.env.WHATSAPP_AI_ENABLED === 'true';

  const aiSenderCheck = await supabaseAdmin
    .from('client_messages')
    .insert([
      {
        phone: '00000000000',
        channel: 'whatsapp',
        sender: 'ai',
        body: '[diagnostic test row — safe to ignore/delete]',
      },
    ])
    .select('id')
    .single();

  report.ai_sender_allowed = !aiSenderCheck.error;
  if (aiSenderCheck.error) {
    report.ai_sender_error = aiSenderCheck.error.message;
  } else {
    await supabaseAdmin.from('client_messages').delete().eq('id', aiSenderCheck.data.id);
  }

  return NextResponse.json(report);
}
