import test from 'node:test';
import assert from 'node:assert/strict';
import { messageAssignees, assigneeLabel } from '../lib/messageAssignees.js';

test('conversations can go to vets, techs and finance (admin), not reception or drivers', () => {
  const staff = [
    { id: 'a', full_name: 'Admin Sample', role: 'admin' },
    { id: 'r', full_name: 'Reception Sample', role: 'reception' },
    { id: 'v', full_name: 'Dr. Sample', role: 'vet' },
    { id: 't', full_name: 'Tech Sample', role: 'tech' },
    { id: 'd', full_name: 'Driver Sample', role: 'driver' },
    { id: 'x', full_name: 'Old Vet', role: 'vet', active: false },
  ];
  assert.deepEqual(messageAssignees(staff).map((s) => s.id), ['v', 't', 'a']);
  assert.equal(assigneeLabel(staff[0]), 'Admin Sample · finance');
  assert.equal(assigneeLabel(staff[2]), 'Dr. Sample');
});
