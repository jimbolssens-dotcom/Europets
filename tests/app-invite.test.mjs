import test from 'node:test';
import assert from 'node:assert/strict';
import { inviteDecision, appInviteText } from '../lib/appInvite.js';

// Tue 27 Oct 2026, 15:00 UAE.
const now = Date.parse('2026-10-27T11:00:00Z');
const ago = (min) => new Date(now - min * 60000).toISOString();
const fresh = { client_app_last_seen_at: null, app_invited_at: null, app_invite_count: 0 };
const quiet = [
  { sender: 'client', body: 'Can I book Luna for Thursday?', created_at: ago(50) },
  { sender: 'ai', body: 'Booked for Thursday at 11:00.', created_at: ago(49) },
];
const decide = (over = {}) => inviteDecision({ client: fresh, rows: quiet, livingPets: 1, flagged: false, now, ...over });

test('a client who wrote to us and never opened the app gets invited once it is quiet', () => {
  assert.deepEqual(decide(), { send: true });
});

test('not while the conversation is going, waiting on staff, or out of hours', () => {
  assert.equal(decide({ rows: [...quiet, { sender: 'client', body: 'Thanks!', created_at: ago(5) }] }).reason, 'conversation still going');
  assert.equal(decide({ flagged: true }).reason, 'waiting on staff');
  assert.equal(decide({ now: Date.parse('2026-10-27T17:30:00Z'), rows: quiet.map((r) => ({ ...r, created_at: new Date(Date.parse(r.created_at) + 6.5 * 3600000).toISOString() })) }).reason, 'outside hours');
});

test('not for app users, too soon after the last invite, or after three', () => {
  assert.equal(decide({ client: { ...fresh, client_app_last_seen_at: ago(100) } }).reason, 'uses the app');
  assert.equal(decide({ client: { ...fresh, app_invited_at: ago(30 * 24 * 60), app_invite_count: 1 } }).reason, 'invited recently');
  assert.deepEqual(decide({ client: { ...fresh, app_invited_at: ago(61 * 24 * 60), app_invite_count: 1 } }), { send: true });
  assert.equal(decide({ client: { ...fresh, app_invited_at: ago(200 * 24 * 60), app_invite_count: 3 } }).reason, 'invited enough');
});

test('not when they have not written lately, have no pets with us, or were just sent the app link', () => {
  assert.equal(decide({ rows: quiet.map((r) => ({ ...r, created_at: ago(22 * 60) })) }).reason, 'no recent message from them');
  assert.equal(decide({ livingPets: 0 }).reason, 'no pets with us');
  assert.equal(decide({ rows: [...quiet.slice(0, 1), { sender: 'ai', body: 'Your invoice is in your app: https://portal.epc.vet/client-app', created_at: ago(49) }] }).reason, 'app link already sent');
});

test('the invite names the pets and says how to log in and install', () => {
  const text = appInviteText({ name: 'Sara', petNames: ['Luna', 'Max'], appUrl: 'https://portal.epc.vet' });
  assert.match(text, /^Hi Sara! Did you know/);
  assert.match(text, /Luna and Max's records/);
  assert.match(text, /https:\/\/portal\.epc\.vet\/client-app and log in with this WhatsApp number/);
  assert.match(text, /Add to Home Screen/);
  assert.doesNotMatch(text, /[—–]/);
  assert.match(appInviteText({ name: 'Sara', petNames: ['A', 'B', 'C'], appUrl: 'x', repeat: true }), /^Hi Sara! Just a reminder[\s\S]*your pets' records/);
});
