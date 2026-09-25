// lib/intakeInviteLink.js
// Server-only: sends a self-service intake link over WhatsApp from the
// clinic's own WhatsApp Business number, via the pre-approved
// new_patient_intake_link template (see lib/metaWhatsapp.js's
// sendNewPatientIntakeLink). Shared by the Invite page's quick-send button
// and its resend button on an already-generated link.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendNewPatientIntakeLink } from '@/lib/metaWhatsapp';

export async function sendIntakeLinkForRequest(intakeRequestId) {
  const { data: request, error } = await supabase
    .from('intake_requests')
    .select('id, sent_to_phone, client_id')
    .eq('id', intakeRequestId)
    .single();
  if (error || !request) {
    return { sent: false, reason: 'intake request not found' };
  }

  const digits = (request.sent_to_phone || '').replace(/\D/g, '');
  if (!digits) {
    return { sent: false, reason: 'no phone number on file for this request' };
  }
  if (!process.env.APP_URL) {
    return { sent: false, reason: 'APP_URL is not configured' };
  }

  const intakeUrl = `${process.env.APP_URL}/portal/intake/${request.id}`;

  try {
    const waMessageId = await sendNewPatientIntakeLink(digits, { intakeUrl });
    await supabaseAdmin.from('client_messages').insert([
      {
        client_id: request.client_id || null,
        phone: digits,
        channel: 'whatsapp',
        sender: 'staff',
        body: `Intake link sent: ${intakeUrl}`,
        wa_message_id: waMessageId,
        status: 'sent',
      },
    ]);
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}
