import test from 'node:test';
import assert from 'node:assert/strict';
import { nextInternName, accessExpired, STAFF_ROLES } from '../lib/staffRoles.js';
import { inGroup } from '../lib/teamChatPlan.js';

test('a new intern gets the next free placeholder name', () => {
  assert.equal(nextInternName([]), 'Intern 1');
  assert.equal(nextInternName([{ full_name: 'Intern 1' }, { full_name: 'intern 2' }, { full_name: 'Dr. Sample' }]), 'Intern 3');
  assert.ok(STAFF_ROLES.includes('intern'));
});

test('access runs to the end of the last day, then stops', () => {
  assert.equal(accessExpired({ access_until: '2026-11-30' }, '2026-11-30'), false);
  assert.equal(accessExpired({ access_until: '2026-11-30' }, '2026-12-01'), true);
  assert.equal(accessExpired({ access_until: null }, '2026-12-01'), false);
});

test('interns are in Medical and Everyone, until their last day', () => {
  const intern = { id: 'i1', role: 'intern', active: true, access_until: '2026-11-30' };
  assert.equal(inGroup({ roles: ['vet', 'tech', 'intern'] }, intern, [], '2026-11-01'), true);
  assert.equal(inGroup({ roles: null }, intern, [], '2026-11-30'), true);
  assert.equal(inGroup({ roles: null }, intern, [], '2026-12-01'), false);
  assert.equal(inGroup({ roles: ['admin', 'reception'] }, intern, [], '2026-11-01'), false);
});
