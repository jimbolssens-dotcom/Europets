// lib/teamChat.js
// The clinic's team chat (migration 219; rules in lib/teamChatPlan.js):
// four groups (Everyone, Medical: vets and techs, Reception, Finance:
// admin and reception), members by role plus
// anyone added, messages with photos, voice notes and @mentions, read
// receipts, and phone alerts (an @mention always alerts; other messages per
// each person's setting; on their own WhatsApp when their number is on
// file, lib/teamWhatsapp.js). A client's WhatsApp message can be shared in, and
// the reply to the client goes from the clinic WhatsApp number through the
// client's own chat (POST /api/clients/:id/messages).

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendPushToStaff } from '@/lib/pushNotifications';
import { groupMembers, mentionedIds, alertTargets, alertText } from '@/lib/teamChatPlan';
import { deliverToWhatsApp } from '@/lib/teamWhatsapp';

const MESSAGE_FIELDS = 'id, group_key, staff_id, body, media_url, media_type, media_name, mentions, ref, replied_by, replied_at, source, created_at';

async function allStaff() {
  const { data } = await supabaseAdmin.from('staff').select('id, full_name, role, active, access_until, whatsapp_phone, whatsapp_last_in_at');
  return data || [];
}

async function extras() {
  const { data } = await supabaseAdmin.from('team_group_members').select('group_key, staff_id');
  const map = new Map();
  for (const r of data || []) map.set(r.group_key, [...(map.get(r.group_key) || []), r.staff_id]);
  return map;
}

// Every group with its members, in order.
export async function loadGroups() {
  const [{ data: groups }, staff, extra] = await Promise.all([
    supabaseAdmin.from('team_groups').select('key, name, roles, sort').order('sort'),
    allStaff(),
    extras(),
  ]);
  return {
    staff,
    groups: (groups || []).map((g) => ({ ...g, members: groupMembers(g, staff, extra.get(g.key) || []) })),
  };
}

// The groups this person is in, each with its unread count and last message.
export async function teamSummary(staffId) {
  const { groups } = await loadGroups();
  const mine = groups.filter((g) => !staffId || g.members.some((m) => m.id === staffId));
  const { data: reads } = staffId ? await supabaseAdmin.from('team_reads').select('group_key, last_read_at').eq('staff_id', staffId) : { data: [] };
  const readAt = new Map((reads || []).map((r) => [r.group_key, r.last_read_at]));
  const out = [];
  for (const g of mine) {
    let unread = 0;
    if (staffId) {
      let q = supabaseAdmin.from('team_messages').select('id', { count: 'exact', head: true }).eq('group_key', g.key).neq('staff_id', staffId);
      if (readAt.get(g.key)) q = q.gt('created_at', readAt.get(g.key));
      unread = (await q).count || 0;
    }
    const { data: last } = await supabaseAdmin.from('team_messages').select('body, media_type, created_at').eq('group_key', g.key).order('created_at', { ascending: false }).limit(1);
    out.push({ key: g.key, name: g.name, member_count: g.members.length, unread, last: last?.[0] || null });
  }
  return out;
}

// A group's latest messages (oldest first), with who wrote them and how
// many of the others have read each; marks it read for this person.
export async function groupThread(groupKey, staffId, { limit = 80 } = {}) {
  const { groups, staff } = await loadGroups();
  const group = groups.find((g) => g.key === groupKey);
  if (!group) return { error: 'group not found', status: 404 };
  if (staffId && !group.members.some((m) => m.id === staffId)) return { error: "You're not in this group", status: 403 };
  const [{ data: rows }, { data: reads }] = await Promise.all([
    supabaseAdmin.from('team_messages').select(MESSAGE_FIELDS).eq('group_key', groupKey).order('created_at', { ascending: false }).limit(limit),
    supabaseAdmin.from('team_reads').select('staff_id, last_read_at').eq('group_key', groupKey),
  ]);
  const names = new Map(staff.map((s) => [s.id, s]));
  const messages = (rows || []).reverse().map((m) => ({
    ...m,
    staff_name: names.get(m.staff_id)?.full_name || 'Someone',
    staff_role: names.get(m.staff_id)?.role || null,
    replied_by_name: m.replied_by ? names.get(m.replied_by)?.full_name || null : null,
    seen_by: (reads || []).filter((r) => r.staff_id !== m.staff_id && Date.parse(r.last_read_at) >= Date.parse(m.created_at)).length,
  }));
  if (staffId) await markRead(groupKey, staffId);
  return { group: { key: group.key, name: group.name, members: group.members.map((s) => ({ id: s.id, full_name: s.full_name, role: s.role, on_whatsapp: !!s.whatsapp_phone })) }, messages };
}

export async function markRead(groupKey, staffId) {
  await supabaseAdmin.from('team_reads').upsert({ group_key: groupKey, staff_id: staffId, last_read_at: new Date().toISOString() });
}

// Posts a message and sends the phone alerts. body or media or ref needed.
export async function postTeamMessage(groupKey, staffId, { body, media_url, media_type, media_name, mentions, ref, source = 'app', wa_message_id = null }) {
  const { groups, staff } = await loadGroups();
  const group = groups.find((g) => g.key === groupKey);
  if (!group) return { error: 'group not found', status: 404 };
  const sender = staff.find((s) => s.id === staffId);
  if (!sender || !group.members.some((m) => m.id === staffId)) return { error: "Pick who you are first (you must be in this group)", status: 403 };
  const text = String(body || '').trim().slice(0, 4000);
  const cleanRef =
    ref && ref.kind === 'client_message' && ref.client_id
      ? {
          kind: 'client_message',
          client_id: String(ref.client_id),
          client_name: String(ref.client_name || '').slice(0, 120) || null,
          message_id: ref.message_id ? String(ref.message_id) : null,
          quote: String(ref.quote || '').slice(0, 600) || null,
          patient_name: String(ref.patient_name || '').slice(0, 80) || null,
        }
      : null;
  const media = typeof media_url === 'string' && /^https:\/\//.test(media_url) ? { media_url, media_type: ['image', 'audio', 'file'].includes(media_type) ? media_type : 'file', media_name: String(media_name || '').slice(0, 200) || null } : {};
  if (!text && !media.media_url && !cleanRef) return { error: 'Type a message first', status: 400 };
  const mentioned = mentionedIds(text, Array.isArray(mentions) ? mentions : [], group.members);
  const { data, error } = await supabaseAdmin
    .from('team_messages')
    .insert([{ group_key: groupKey, staff_id: staffId, body: text || null, mentions: mentioned, ref: cleanRef, source: source === 'whatsapp' ? 'whatsapp' : 'app', wa_message_id, ...media }])
    .select(MESSAGE_FIELDS)
    .single();
  // A WhatsApp delivery Meta retried: already posted.
  if (error?.code === '23505') return { duplicate: true };
  if (error) return { error: error.message, status: 500 };
  await markRead(groupKey, staffId);

  const { data: notify } = await supabaseAdmin.from('team_notify').select('staff_id, level');
  const levels = new Map((notify || []).map((n) => [n.staff_id, n.level]));
  const targets = alertTargets(group.members, staffId, mentioned, levels);
  // On their WhatsApp first; a phone push for anyone it couldn't reach.
  const reached = await deliverToWhatsApp(data, {
    groupName: group.name,
    senderName: sender.full_name,
    targets: group.members.filter((m) => targets.includes(m.id)),
    mentioned,
  }).catch(() => new Set());
  const { title, body: pushBody } = alertText(group.name, sender.full_name, data);
  await Promise.all(
    targets.filter((id) => !reached.has(id)).map((id) =>
      sendPushToStaff(id, { title: mentioned.includes(id) ? `${title} · @you` : title, body: pushBody, url: `/messages/team?g=${groupKey}` }).catch(() => {})
    )
  );
  return { message: data, alerted: targets.length, on_whatsapp: reached.size };
}

// After a reply to the client went out from the team chat.
export async function markReplied(messageId, staffId) {
  const { error } = await supabaseAdmin.from('team_messages').update({ replied_by: staffId, replied_at: new Date().toISOString() }).eq('id', messageId);
  return error ? { error: error.message, status: 500 } : { ok: true };
}

export async function getNotifyLevel(staffId) {
  const { data } = await supabaseAdmin.from('team_notify').select('level').eq('staff_id', staffId).maybeSingle();
  return data?.level || 'all';
}

export async function setNotifyLevel(staffId, level) {
  if (!['all', 'mentions', 'off'].includes(level)) return { error: 'level must be all, mentions or off', status: 400 };
  const { error } = await supabaseAdmin.from('team_notify').upsert({ staff_id: staffId, level });
  return error ? { error: error.message, status: 500 } : { level };
}
