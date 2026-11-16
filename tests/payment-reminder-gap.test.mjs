// Payment reminders are at least 10 days apart per client (concierge
// review of 16 Nov): replays an anonymised real case, a client with many
// open invoices reminded on 12, 13, 14 (twice) and 15 November.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientRemindedRecently, MIN_GAP_DAYS } from '../lib/reminderStages.js';

const C = 'client-a';
const sent = (t, channel = 'whatsapp', client = C) => ({ client_id: client, channel, sent_at: t });

test('a reminder yesterday about another invoice holds today\'s', () => {
  const sends = [sent('2026-11-12T08:20:00Z'), sent('2026-11-13T06:20:00Z')];
  assert.equal(clientRemindedRecently(sends, C, 'whatsapp', new Date('2026-11-14T06:20:00Z')), true);
  // The 11:20 run on the same day.
  assert.equal(clientRemindedRecently([...sends, sent('2026-11-14T06:20:00Z')], C, 'whatsapp', new Date('2026-11-14T07:20:00Z')), true);
});

test('after the gap, the next one goes out', () => {
  const now = new Date(Date.parse('2026-11-12T08:20:00Z') + (MIN_GAP_DAYS + 0.01) * 86400000);
  assert.equal(clientRemindedRecently([sent('2026-11-12T08:20:00Z')], C, 'whatsapp', now), false);
});

test('another client, or the other channel, does not count', () => {
  const now = new Date('2026-11-14T06:20:00Z');
  assert.equal(clientRemindedRecently([sent('2026-11-13T06:20:00Z', 'whatsapp', 'client-b')], C, 'whatsapp', now), false);
  assert.equal(clientRemindedRecently([sent('2026-11-13T06:20:00Z', 'email')], C, 'whatsapp', now), false);
});
