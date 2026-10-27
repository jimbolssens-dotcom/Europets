// lib/appInvite.js
// Who gets invited to the client app, when, and what it says (migration
// 232, app/api/whatsapp/app-invite-sweep). Jim: every client should get a
// message that invites them to the app, whenever they contact us, without
// spamming them. So only a client who has never opened the app, only after
// they wrote to us (inside WhatsApp's 24-hour window, so no template is
// needed), once the conversation has gone quiet and nothing is waiting on
// staff, in clinic hours, and at most every 60 days, three times in all.
// Pure, so it can be tested (tests/app-invite.test.mjs).

export const INVITE_EVERY_DAYS = 60;
export const MAX_INVITES = 3;
export const QUIET_MINUTES = 30;
// Inside WhatsApp's 24-hour reply window, with room to spare.
export const WINDOW_HOURS = 20;
// UAE clinic hours for sending: 9:00 to 20:00.
export const SEND_FROM_HOUR = 9;
export const SEND_UNTIL_HOUR = 20;

const uaeHour = (now) => new Date(now + 4 * 60 * 60 * 1000).getUTCHours();

// client: { client_app_last_seen_at, app_invited_at, app_invite_count }
// rows: the thread's messages, oldest first ({ sender, created_at, body, is_notice })
// livingPets: how many pets on file are neither deceased nor rehomed
// flagged: the thread is waiting on staff
export function inviteDecision({ client, rows, livingPets, flagged, now = Date.now() }) {
  if (client.client_app_last_seen_at) return { send: false, reason: 'uses the app' };
  if ((client.app_invite_count || 0) >= MAX_INVITES) return { send: false, reason: 'invited enough' };
  if (client.app_invited_at && now - Date.parse(client.app_invited_at) < INVITE_EVERY_DAYS * 86400000) return { send: false, reason: 'invited recently' };
  if (!livingPets) return { send: false, reason: 'no pets with us' };
  if (flagged) return { send: false, reason: 'waiting on staff' };
  const hour = uaeHour(now);
  if (hour < SEND_FROM_HOUR || hour >= SEND_UNTIL_HOUR) return { send: false, reason: 'outside hours' };

  const lastClient = [...rows].reverse().find((r) => r.sender === 'client');
  if (!lastClient || now - Date.parse(lastClient.created_at) > WINDOW_HOURS * 3600000) return { send: false, reason: 'no recent message from them' };
  const last = rows[rows.length - 1];
  if (now - Date.parse(last.created_at) < QUIET_MINUTES * 60000) return { send: false, reason: 'conversation still going' };
  // The app link already went out in this conversation (the concierge sends it for invoices and reports).
  const since = now - INVITE_EVERY_DAYS * 86400000;
  if (rows.some((r) => r.sender !== 'client' && /\/client-app\b/.test(r.body || '') && Date.parse(r.created_at) > since)) {
    return { send: false, reason: 'app link already sent' };
  }
  return { send: true };
}

function petsLabel(names) {
  const n = names.filter(Boolean);
  if (!n.length) return 'your pets';
  if (n.length === 1) return n[0];
  if (n.length === 2) return `${n[0]} and ${n[1]}`;
  return 'your pets';
}

export function appInviteText({ name, petNames = [], appUrl, repeat = false }) {
  const pets = petsLabel(petNames);
  const opener = repeat ? `Hi ${name}! Just a reminder that Europets has its own app 📱` : `Hi ${name}! Did you know Europets has its own app? 📱`;
  return [
    `${opener} In one place you can see ${pets === 'your pets' ? "your pets'" : `${pets}'s`} records, vaccinations and reports, download your invoices, check your appointments and book cattery stays.`,
    `To start, open ${appUrl}/client-app and log in with this WhatsApp number. We'll send your code here.`,
    'To keep it on your phone: on iPhone tap Share, then "Add to Home Screen". On Android tap ⋮, then "Install app" or "Add to Home screen".',
  ].join('\n\n');
}
