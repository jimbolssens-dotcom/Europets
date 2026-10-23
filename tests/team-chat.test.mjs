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
