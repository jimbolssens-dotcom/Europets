// lib/whatsappNumberOnFile.js
// Makes sure a WhatsApp number we've actually been messaging is saved on
// the client's file (client_phones), so their future WhatsApp messages
// match them. Incoming messages are matched by the client's saved numbers
// (lib/phoneMatch.js), so a client who typed a different number (say, a
// landline) on their registration form would otherwise stay "unregistered"
// on WhatsApp forever. Used when a registration form sent to a number is
// approved, and when staff link an unregistered number to a client.
// With { makeMain: true } (the registration case, where we know for sure
// this is the number they use WhatsApp on) it also becomes their main
// WhatsApp number (clients.phone, the is_whatsapp row), which reminders and
// other clinic WhatsApps are sent to; the number they typed stays on file.
// Best effort: never throws.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { phoneSearchDigits } from '@/lib/phoneMatch';

export async function ensureWhatsAppNumberOnFile(clientId, phone, { makeMain = false } = {}) {
  try {
    const digits = (phone || '').replace(/\D/g, '');
    if (!clientId || digits.length < 8) return false;
    const [{ data: phoneRows }, { data: client }] = await Promise.all([
      supabaseAdmin.from('client_phones').select('phone').eq('client_id', clientId),
      supabaseAdmin.from('clients').select('phone').eq('id', clientId).maybeSingle(),
    ]);
    const key = phoneSearchDigits(digits);
    const existing = (phoneRows || []).find((r) => phoneSearchDigits(r.phone) === key);
    const isMainAlready = client?.phone && phoneSearchDigits(client.phone) === key;
    if (existing || isMainAlready) {
      if (!makeMain || isMainAlready) return false;
    } else {
      await supabaseAdmin
        .from('client_phones')
        .insert([{ client_id: clientId, phone: `+${digits}`, label: 'WhatsApp', is_whatsapp: false }]);
    }
    if (makeMain) {
      await supabaseAdmin.from('client_phones').update({ is_whatsapp: false }).eq('client_id', clientId);
      const { data: rows } = await supabaseAdmin.from('client_phones').select('id, phone').eq('client_id', clientId);
      const row = (rows || []).find((r) => phoneSearchDigits(r.phone) === key);
      if (row) await supabaseAdmin.from('client_phones').update({ is_whatsapp: true }).eq('id', row.id);
      await supabaseAdmin.from('clients').update({ phone: row?.phone || `+${digits}` }).eq('id', clientId);
    }
    return true;
  } catch (err) {
    console.error('Could not save WhatsApp number on client file', clientId, err);
    return false;
  }
}
