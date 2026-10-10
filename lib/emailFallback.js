// lib/emailFallback.js
// Sending an automated message by email instead, because its WhatsApp
// could not be sent or never arrived (see migration 171). Logs the email
// in the client's chat thread like any other automated send.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendEmail } from '@/lib/email';

export async function sendFallbackEmail({ clientId, to, subject, text }) {
  await sendEmail({ to, subject, text });
  await supabaseAdmin.from('client_messages').insert([
    {
      client_id: clientId,
      channel: 'email',
      // 'system', not 'staff' (see migration 163): an automated send tagged
      // 'staff' tells the AI concierge a human has taken over the thread.
      sender: 'system',
      subject,
      body: text,
      status: 'sent',
    },
  ]);
}

// Called from the WhatsApp webhook when a message's status turns 'failed'.
// Claims the row first (fallback_email_sent_at still null) so a repeated
// 'failed' delivery from Meta can never send the email twice.
export async function sendFallbackEmailForFailedWhatsApp(waMessageId) {
  const { data: claimed } = await supabaseAdmin
    .from('client_messages')
    .update({ fallback_email_sent_at: new Date().toISOString() })
    .eq('wa_message_id', waMessageId)
    .not('fallback_email', 'is', null)
    .is('fallback_email_sent_at', null)
    .select('client_id, fallback_email')
    .maybeSingle();
  const email = claimed?.fallback_email;
  if (!email?.to) return;
  try {
    await sendFallbackEmail({ clientId: claimed.client_id, to: email.to, subject: email.subject, text: email.text });
  } catch (err) {
    console.error('Fallback email after failed WhatsApp did not send', waMessageId, err.message);
  }
}
