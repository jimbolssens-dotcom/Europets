// lib/clientAppInviteLink.js
// Server-only: sends the client-app install/login link over WhatsApp from
// the clinic's own WhatsApp Business number, via the pre-approved
// client_app_link template (see lib/metaWhatsapp.js's
// sendClientAppLinkMessage). Used by the Invite page's "Client App Link"
// quick-send. Not tied to any one record (unlike the intake link) — this
// just takes a phone number and best-effort matches it to a client for
// logging the send to their message thread; the send itself doesn't
// require a match, same as the free-form fallback it replaces never did.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendClientAppLinkMessage } from '@/lib/metaWhatsapp';
import { phoneSearchDigits, clientIdsWithPhoneLike } from '@/lib/phoneMatch';

export async function sendClientAppLinkForPhone(rawPhone) {
  const digits = (rawPhone || '').replace(/\D/g, '');
  if (!digits) {
    return { sent: false, reason: 'no phone number given' };
  }

  let clientId = null;
  let clientName = null;
  const searchDigits = phoneSearchDigits(digits);
  if (searchDigits) {
    const extraIds = await clientIdsWithPhoneLike(supabase, `%${searchDigits}%`);
    const orFilter =
      extraIds.length > 0 ? `phone.ilike.%${searchDigits}%,id.in.(${extraIds.join(',')})` : `phone.ilike.%${searchDigits}%`;
    const { data: matches } = await supabase.from('clients').select('id, full_name').or(orFilter);
    if (matches && matches.length === 1) {
      clientId = matches[0].id;
      clientName = matches[0].full_name;
    }
  }

  try {
    const waMessageId = await sendClientAppLinkMessage(digits, { clientName });
    await supabaseAdmin.from('client_messages').insert([
      {
        client_id: clientId,
        phone: digits,
        channel: 'whatsapp',
        sender: 'staff',
        body: 'Client app link sent',
        wa_message_id: waMessageId,
        status: 'sent',
      },
    ]);
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}
