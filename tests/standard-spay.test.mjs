import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSpayProcedure, standardSpayNotes, isCastrationProcedure, standardSurgeryNotes } from '../lib/standardSpay.js';
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

test('castration standard', () => {
  assert.ok(isCastrationProcedure('Castration - Cat'));
  assert.ok(isCastrationProcedure('Neuter dog'));
  assert.ok(!isCastrationProcedure('Spey cat'));
  assert.ok(!isCastrationProcedure('Cryptorchid castration 26 -40kg'));
  const cat = standardSurgeryNotes({ procedureName: 'Castration Cat', species: 'cat' });
  assert.ok(cat.includes('single incision over the scrotum') && cat.includes('5 days'));
  const dog = standardSurgeryNotes({ procedureName: 'Castration Dog', species: 'dog', weightKg: 30 });
  for (const s of ['3 cm', 'closed castration', 'crushed', 'Vicryl 0', 'subcutaneous', 'intradermal']) assert.ok(dog.includes(s), s);
  assert.ok(standardSurgeryNotes({ procedureName: 'Castration Dog', species: 'dog', weightKg: 6 }).includes('Vicryl 2-0'));
  assert.equal(standardSurgeryNotes({ procedureName: 'Mass removal', species: 'dog' }), null);
});
