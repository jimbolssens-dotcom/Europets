// lib/whatsappReplyTarget.js
// Which number a WhatsApp message to a client goes to, and whether that
// number's 24-hour window is open (see lib/whatsappWindow.js for the rule).
// Returns { digits, windowOpen } ('' digits when there's nowhere to send).

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { pickWhatsAppTarget } from '@/lib/whatsappWindow';

export async function whatsappReplyTarget(clientId) {
  const [{ data: client }, { data: lastInbound }] = await Promise.all([
    supabaseAdmin.from('clients').select('phone').eq('id', clientId).maybeSingle(),
    supabaseAdmin
      .from('client_messages')
      .select('created_at, phone')
      .eq('client_id', clientId)
      .eq('sender', 'client')
      .eq('channel', 'whatsapp')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return pickWhatsAppTarget({ mainPhone: client?.phone, lastInbound });
}
