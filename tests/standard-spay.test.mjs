import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSpayProcedure, standardSpayNotes } from '../lib/standardSpay.js';
import { procedureReportSystemPrompt } from '../lib/procedureReportPrompt.js';

test('spay names', () => {
  assert.ok(isSpayProcedure('Spay - Cat'));
  assert.ok(isSpayProcedure('Ovariohysterectomy'));
  assert.ok(isSpayProcedure('Spey cat'));
  assert.ok(isSpayProcedure('Spey dog10-25kg'));
  assert.ok(!isSpayProcedure('Pyometra spay'));
  assert.ok(!isSpayProcedure('Castration - Dog'));
  assert.ok(!isSpayProcedure('Mass removal'));
});

test('cat: 4 cm caudal, 1 cm incision, Vicryl 2-0, cone 5 days, no antibiotics', () => {
  const t = standardSpayNotes({ species: 'Cat' });
  for (const s of ['4 cm caudal', '1 cm', 'Vicryl 2-0', 'intradermal', '5 days', 'no post-operative antibiotics']) assert.ok(t.includes(s), s);
});

test('dog suture by weight', () => {
  assert.ok(standardSpayNotes({ species: 'dog', weightKg: 8 }).includes('Vicryl 2-0'));
  assert.ok(standardSpayNotes({ species: 'dog', weightKg: 25 }).includes('Vicryl 0'));
  assert.ok(standardSpayNotes({ species: 'dog', weightKg: 25 }).includes('2 cm caudal'));
  assert.equal(standardSpayNotes({ species: 'rabbit' }), null);
});

test('the report prompt forbids pointing out missing information', () => {
  assert.match(procedureReportSystemPrompt('surgery'), /Never mention, list or hint at information that is missing/);
});
