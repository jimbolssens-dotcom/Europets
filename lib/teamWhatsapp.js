// lib/teamWhatsapp.js
// The team chat (migration 219) on staff's own WhatsApp (migration 220):
// each group message goes to every member with a WhatsApp number on file,
// from the clinic number, as "*Sender · Group*" and the message (a plain
// message while their 24-hour window is open, else the approved
// team_message template). A staff member's WhatsApp message to the clinic
// number comes back in through the webhook (app/api/whatsapp/webhook) and
// is posted to the right group (lib/teamChatPlan.js#groupForReply), which
// sends it on to everyone else the same way. Every copy is logged
// (team_deliveries) so a quoted reply finds its group.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendWhatsAppText, sendWhatsAppMedia, sendTeamTemplate, submitTeamMessageTemplate, isWhatsAppConfigured } from '@/lib/metaWhatsapp';
import { whatsappCopy, whatsappWindowOpen, groupForReply } from '@/lib/teamChatPlan';

const appUrl = () => process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://portal.epc.vet';

let templateSubmitted = false;

// Sends one team message to these members (staff rows with whatsapp_phone,
// whatsapp_last_in_at). Returns the ids it reached.
export async function deliverToWhatsApp(msg, { groupName, senderName, targets, mentioned = [] }) {
  if (!isWhatsAppConfigured()) return new Set();
  const reached = new Set();
  await Promise.all(
    targets
      .filter((s) => s.whatsapp_phone)
      .map(async (s) => {
        const text = whatsappCopy({ groupName, senderName, mentioned: mentioned.includes(s.id), msg, appUrl: appUrl() });
        const row = { team_message_id: msg.id, staff_id: s.id };
        try {
          if (whatsappWindowOpen(s.whatsapp_last_in_at)) {
            if (msg.media_type === 'image' && msg.media_url) {
              row.wa_message_id = await sendWhatsAppMedia(s.whatsapp_phone, { url: msg.media_url, contentType: 'image/jpeg', caption: text });
              row.via = 'media';
            } else {
              row.wa_message_id = await sendWhatsAppText(s.whatsapp_phone, text);
              row.via = 'text';
            }
          } else {
            const who = `${senderName || 'Team'} in ${groupName}${mentioned.includes(s.id) ? ' (@you)' : ''}`;
            row.wa_message_id = await sendTeamTemplate(s.whatsapp_phone, { who, text: text.split('\n').slice(1).join('\n') || (msg.media_type === 'image' ? `📷 Photo: ${msg.media_url}` : '') });
            row.via = 'template';
          }
          reached.add(s.id);
        } catch (err) {
          row.via = row.via || 'template';
          row.status = 'failed';
          row.error = String(err.message || err).slice(0, 300);
          // The template isn't approved yet: ask Meta for it (once).
          if (err.templateUnavailable && !templateSubmitted) {
            templateSubmitted = true;
            await submitTeamMessageTemplate().catch(() => {});
          }
        }
        await supabaseAdmin.from('team_deliveries').insert([row]);
      })
  );
  return reached;
}

// The staff member a WhatsApp number belongs to, or null.
export async function staffForPhone(digits) {
  if (!digits) return null;
  const { data } = await supabaseAdmin.from('staff').select('id, full_name, role, active, access_until, whatsapp_phone').eq('whatsapp_phone', digits).maybeSingle();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
  return data && data.active !== false && !(data.access_until && String(data.access_until) < today) ? data : null;
}

// Whether a WhatsApp message is a reply quoting a team message copy.
export async function quotedTeamGroup(contextId) {
  if (!contextId) return null;
  const { data } = await supabaseAdmin.from('team_deliveries').select('team_messages(group_key)').eq('wa_message_id', contextId).maybeSingle();
  return data?.team_messages?.group_key || null;
}

// A staff member's WhatsApp message to the clinic number: into the right
// group, then on to everyone else. media: { media_url, media_type } already
// stored by the webhook.
export async function postFromWhatsApp(staff, message, { body, media = {} }) {
  const { postTeamMessage, loadGroups } = await import('@/lib/teamChat');
  await supabaseAdmin.from('staff').update({ whatsapp_last_in_at: new Date().toISOString() }).eq('id', staff.id);
  const [{ groups }, quotedGroup, { data: last }] = await Promise.all([
    loadGroups(),
    quotedTeamGroup(message.context?.id),
    supabaseAdmin.from('team_deliveries').select('team_messages(group_key)').eq('staff_id', staff.id).order('created_at', { ascending: false }).limit(1),
  ]);
  const mine = groups.filter((g) => g.members.some((m) => m.id === staff.id)).map((g) => g.key);
  const lastGroup = last?.[0]?.team_messages?.group_key || null;
  const pick = groupForReply(body, { quotedGroup: mine.includes(quotedGroup) ? quotedGroup : null, lastGroup: mine.includes(lastGroup) ? lastGroup : null, groupKeys: mine });
  const group = mine.includes(pick.group) ? pick.group : 'everyone';
  // Everyone named with an @ in the text counts as mentioned.
  const members = groups.find((g) => g.key === group)?.members || [];
  return postTeamMessage(group, staff.id, {
    body: pick.body,
    mentions: members.map((m) => m.id),
    source: 'whatsapp',
    wa_message_id: message.id,
    ...(media.media_url ? { media_url: media.media_url, media_type: media.media_type === 'image' ? 'image' : media.media_type === 'audio' ? 'audio' : 'file' } : {}),
  });
}
