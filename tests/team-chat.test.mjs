import test from 'node:test';
import assert from 'node:assert/strict';
import { inGroup, groupMembers, mentionedIds, alertTargets, alertText, unreadCount } from '../lib/teamChatPlan.js';

const staff = [
  { id: 'v1', full_name: 'Dr. Sample', role: 'vet' },
  { id: 't1', full_name: 'Tech Sample', role: 'tech' },
  { id: 'r1', full_name: 'Reception Sample', role: 'reception' },
  { id: 'a1', full_name: 'Finance Sample', role: 'admin' },
  { id: 'x1', full_name: 'Gone Sample', role: 'vet', active: false },
];

test('groups by role, Everyone is everyone active, people can be added', () => {
  assert.deepEqual(groupMembers({ roles: null }, staff).map((s) => s.id), ['v1', 't1', 'r1', 'a1']);
  assert.deepEqual(groupMembers({ roles: ['vet'] }, staff).map((s) => s.id), ['v1']);
  assert.deepEqual(groupMembers({ roles: ['admin'] }, staff, ['v1']).map((s) => s.id), ['v1', 'a1']);
  assert.equal(inGroup({ roles: null }, staff[4]), false);
});

test('a mention counts only while its @Name is still in the text', () => {
  assert.deepEqual(mentionedIds('Can you check? @Dr. Sample', ['v1', 'r1'], staff), ['v1']);
  assert.deepEqual(mentionedIds('changed my mind', ['v1'], staff), []);
});

test('alerts: mentions always, the rest by setting, never the sender', () => {
  const members = staff.slice(0, 4);
  const levels = new Map([['t1', 'all'], ['r1', 'off'], ['a1', 'mentions']]);
  assert.deepEqual(alertTargets(members, 'v1', [], levels).sort(), ['t1']);
  assert.deepEqual(alertTargets(members, 'v1', ['r1', 'v1'], levels).sort(), ['r1', 't1']);
});

test('the push says the group, who, and what', () => {
  assert.deepEqual(alertText('Vets', 'Dr. Sample', { body: 'Bloods are back' }), { title: '👥 Vets · Dr. Sample', body: 'Bloods are back' });
  assert.equal(alertText('Everyone', 'X', { media_type: 'audio' }).body, '🎤 Voice note');
  assert.equal(alertText('Everyone', 'X', { ref: { client_name: 'A Client' } }).body, "💬 Shared A Client's message");
});

test('unread: newer than the last read, not your own', () => {
  const msgs = [
    { staff_id: 'v1', created_at: '2026-10-23T08:00:00Z' },
    { staff_id: 't1', created_at: '2026-10-23T09:00:00Z' },
    { staff_id: 't1', created_at: '2026-10-23T07:00:00Z' },
  ];
  assert.equal(unreadCount(msgs, 'v1', '2026-10-23T07:30:00Z'), 1);
  assert.equal(unreadCount(msgs, 'v1', null), 2);
});

import { normalizeWhatsAppPhone, whatsappWindowOpen, whatsappCopy, groupForReply } from '../lib/teamChatPlan.js';

test('WhatsApp numbers as typed become digits with the country code', () => {
  assert.equal(normalizeWhatsAppPhone('050 123 4567'), '971501234567');
  assert.equal(normalizeWhatsAppPhone('+971 50 123 4567'), '971501234567');
  assert.equal(normalizeWhatsAppPhone('00971501234567'), '971501234567');
  assert.equal(normalizeWhatsAppPhone('501234567'), '971501234567');
  assert.equal(normalizeWhatsAppPhone('+44 7700 900123'), '447700900123');
  assert.equal(normalizeWhatsAppPhone('123'), null);
});

test('a plain message only inside their 24 hours, else the template', () => {
  const now = Date.parse('2026-10-23T12:00:00Z');
  assert.equal(whatsappWindowOpen('2026-10-23T01:00:00Z', now), true);
  assert.equal(whatsappWindowOpen('2026-10-22T11:00:00Z', now), false);
  assert.equal(whatsappWindowOpen(null, now), false);
});

test('the WhatsApp copy says who and which group, and links a shared client message', () => {
  const text = whatsappCopy({ groupName: 'Vets', senderName: 'Genie', mentioned: true, appUrl: 'https://portal.test', msg: { body: 'Can someone answer?', ref: { kind: 'client_message', client_id: 'c1', client_name: 'A Client', quote: 'Can Luna go home?' } } });
  assert.equal(text.split('\n')[0], '*Genie · Vets* (@you)');
  assert.match(text, /💬 A Client: "Can Luna go home\?"/);
  assert.match(text, /Reply to them: https:\/\/portal\.test\/messages\/c1/);
  assert.match(whatsappCopy({ groupName: 'Everyone', senderName: 'X', msg: { media_type: 'audio', media_url: 'https://f/v.m4a' } }), /🎤 Voice note: https:\/\/f\/v\.m4a/);
});

test('a WhatsApp reply goes to the #group named, else the quoted group, else the last one', () => {
  const keys = ['everyone', 'vets', 'finance'];
  assert.deepEqual(groupForReply('#finance invoice 740 is paid', { groupKeys: keys, lastGroup: 'vets' }), { group: 'finance', body: 'invoice 740 is paid' });
  assert.deepEqual(groupForReply('ok will do', { quotedGroup: 'vets', lastGroup: 'finance', groupKeys: keys }), { group: 'vets', body: 'ok will do' });
  assert.deepEqual(groupForReply('ok', { lastGroup: 'finance', groupKeys: keys }), { group: 'finance', body: 'ok' });
  assert.deepEqual(groupForReply('#reception hi', { groupKeys: keys }), { group: 'everyone', body: '#reception hi' });
  assert.deepEqual(groupForReply('#Medical bloods are back', { groupKeys: keys }), { group: 'vets', body: 'bloods are back' });
});
