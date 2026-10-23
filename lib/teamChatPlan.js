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

// Who gets a phone alert: members other than the sender whose setting
// allows it ('all'), and anyone mentioned (always, unless they're the
// sender). levels: Map staff id -> 'all' | 'mentions' | 'off'.
export function alertTargets(members, senderId, mentions, levels) {
  const out = new Set();
  for (const m of members) {
    if (m.id === senderId) continue;
    if (mentions.includes(m.id) || (levels.get(m.id) || 'mentions') === 'all') out.add(m.id);
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
