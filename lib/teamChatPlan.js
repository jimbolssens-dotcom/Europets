// lib/teamChatPlan.js
// Pure rules for the team chat (migration 219, lib/teamChat.js), so they
// can be tested (tests/team-chat.test.mjs).

// Whether a staff member is in a group: by role (no roles means everyone)
// or added by name. Inactive staff are in none.
export function inGroup(group, staff, extraIds = []) {
  if (!staff || staff.active === false) return false;
  if (extraIds.includes(staff.id)) return true;
  return !group.roles || group.roles.length === 0 || group.roles.includes(staff.role);
}

export function groupMembers(group, staff, extraIds = []) {
  return (staff || []).filter((s) => inGroup(group, s, extraIds));
}

// The @mentions still in the text: the people picked from the list whose
// "@Name" is still there when it's sent.
export function mentionedIds(text, picked, staff) {
  const body = String(text || '').toLowerCase();
  return [...new Set(picked || [])].filter((id) => {
    const s = (staff || []).find((x) => x.id === id);
    return s && body.includes(`@${String(s.full_name).toLowerCase()}`);
  });
}

// Who hears about a message (on WhatsApp, or a phone push if they have no
// WhatsApp number on file): members other than the sender whose setting
// allows it ('all', the default), and anyone mentioned (always, unless
// they're the sender). levels: Map staff id -> 'all' | 'mentions' | 'off'.
export function alertTargets(members, senderId, mentions, levels) {
  const out = new Set();
  for (const m of members) {
    if (m.id === senderId) continue;
    if (mentions.includes(m.id) || (levels.get(m.id) || 'all') === 'all') out.add(m.id);
  }
  return [...out];
}

// The push text: the group and sender, then the message (or what it is).
export function alertText(groupName, senderName, msg) {
  const what = msg.body?.trim()
    ? msg.body.trim()
    : msg.media_type === 'audio'
      ? '🎤 Voice note'
      : msg.media_type === 'image'
        ? '📷 Photo'
        : msg.ref
          ? `💬 Shared ${msg.ref.client_name || 'a client'}'s message`
          : 'New message';
  return { title: `👥 ${groupName} · ${senderName || 'Team'}`, body: what.length > 140 ? `${what.slice(0, 139)}…` : what };
}

// Unread messages in a group for one person: newer than their last read,
// not their own.
export function unreadCount(messages, staffId, lastReadAt) {
  const since = lastReadAt ? Date.parse(lastReadAt) : 0;
  return (messages || []).filter((m) => m.staff_id !== staffId && Date.parse(m.created_at) > since).length;
}

// A WhatsApp number as typed on the staff page, as digits with the country
// code: 050 123 4567, +971 50 123 4567 and 00971501234567 are all
// 971501234567. Null when it can't be a number.
export function normalizeWhatsAppPhone(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (/^05\d{8}$/.test(d)) d = `971${d.slice(1)}`;
  if (/^5\d{8}$/.test(d)) d = `971${d}`;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

// Whether a plain WhatsApp message can reach them: they wrote to the
// clinic number in the last 24 hours. Otherwise only the template.
export function whatsappWindowOpen(lastInAt, now = Date.now()) {
  return !!lastInAt && now - Date.parse(lastInAt) < 24 * 60 * 60 * 1000;
}

// The WhatsApp copy of a team message: who and which group in bold, then
// the message (a shared client message as a quote, with the link to reply
// to them in the app).
export function whatsappCopy({ groupName, senderName, mentioned = false, msg, appUrl = '' }) {
  const head = `*${senderName || 'Team'} · ${groupName}*${mentioned ? ' (@you)' : ''}`;
  const lines = [head];
  if (msg.body) lines.push(msg.body);
  if (msg.ref?.kind === 'client_message') {
    lines.push(`💬 ${msg.ref.client_name || 'A client'}: "${msg.ref.quote || ''}"`);
    if (appUrl && msg.ref.client_id) lines.push(`Reply to them: ${appUrl}/messages/${msg.ref.client_id}`);
  }
  if (msg.media_url && msg.media_type !== 'image') lines.push(`${msg.media_type === 'audio' ? '🎤 Voice note' : '📎 File'}: ${msg.media_url}`);
  return lines.join('\n');
}

// Which group a staff member's WhatsApp message goes to: one starting with
// #medical (or #vets) / #reception / #finance / #everyone goes there (the
// tag removed);
// else the group of the team message they replied to (quoted); else the
// group they last heard from; else Everyone.
// The Medical group's key is still 'vets' (migration 222).
const TAG_ALIASES = { medical: 'vets' };

export function groupForReply(text, { quotedGroup = null, lastGroup = null, groupKeys = [] } = {}) {
  const m = String(text || '').match(/^\s*#([a-z]+)\b\s*/i);
  const tag = m && (TAG_ALIASES[m[1].toLowerCase()] || m[1].toLowerCase());
  if (m && groupKeys.includes(tag)) return { group: tag, body: String(text).slice(m[0].length) };
  return { group: quotedGroup || lastGroup || 'everyone', body: text };
}

// Whether a WhatsApp message starts with a group tag (#medical, #vets,
// #reception, #finance, #everyone).
export function startsWithTeamTag(text) {
  const m = String(text || '').match(/^\s*#([a-z]+)\b/i);
  return !!m && ['medical', 'vets', 'reception', 'finance', 'everyone'].includes(m[1].toLowerCase());
}
