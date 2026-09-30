// app/api/clients/[id]/send-email/route.js
// POST { subject, text } -> sends a one-off email straight to this
// client's own address on file (never a client-supplied address — always
// looked up server-side, so a staff-authenticated request can't be used
// to relay email to an arbitrary address). Used by the various "✉️
// Email" share buttons (reports, invoices, statements, quotations,
// payment reminders) that used to just open a mailto: draft in staff's
// own mail app — this actually sends it, via lib/email.js (the clinic's
// own SMTP mailbox if configured, Resend otherwise).
//
// Deliberately NOT logged to client_messages and NOT public — this is a
// staff tool for one-off document links, not part of the two-way
// conversation thread (see POST /api/clients/:id/messages for that,
// which channel: 'email' now also supports for an actual back-and-forth).

import { supabase } from '@/lib/supabaseClient';
import { sendEmail } from '@/lib/email';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!subject || !text) {
    return NextResponse.json({ error: 'subject and text are required' }, { status: 400 });
  }

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('email')
    .eq('id', params.id)
    .maybeSingle();
  if (clientError) {
    return NextResponse.json({ error: clientError.message }, { status: 500 });
  }
  if (!client?.email) {
    return NextResponse.json({ error: 'No email address on file for this client' }, { status: 400 });
  }

  try {
    await sendEmail({ to: client.email, subject, text });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
