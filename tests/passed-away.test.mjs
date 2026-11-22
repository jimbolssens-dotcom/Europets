import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerNotTold, hiddenFromClient } from '../lib/passedAway.js';
import { hospitalizationAlarmLevel, combineAlarmLevels, cageAlarmClass } from '../lib/hospitalizationAttention.js';

test('passed away, owner not told: the deceased alarm beats every other', () => {
  const h = { passed_away_at: '2026-11-19T10:00:00Z', owner_informed_at: null, doctor_checkup_requested_at: '2026-11-19T09:00:00Z', update_requested_at: '2026-11-19T09:00:00Z' };
  assert.ok(ownerNotTold(h));
  assert.equal(hospitalizationAlarmLevel(h), 'deceased');
  assert.equal(combineAlarmLevels(['both', 'deceased', 'yellow']), 'deceased');
  assert.equal(cageAlarmClass('deceased'), 'cage-alarm-deceased');
});

test('once the owner is told, no alarm at all', () => {
  const h = { passed_away_at: '2026-11-19T10:00:00Z', owner_informed_at: '2026-11-19T11:00:00Z', update_requested_at: '2026-11-19T09:00:00Z' };
  assert.equal(hospitalizationAlarmLevel(h), 'none');
});

test('the owner never sees it', () => {
  const row = hiddenFromClient({ id: 'h', status: 'admitted', passed_away_at: 'x', passed_away_by: 'y', owner_informed_at: null, owner_informed_by: null, owner_informed_how: null });
  assert.deepEqual(row, { id: 'h', status: 'admitted' });
});
