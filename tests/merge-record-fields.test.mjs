import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecordFields } from '../lib/mergeRecordFields.js';

// 11 Nov: the vet added a line to Treatment plan notes while the consult
// recording was processing; the recording appended the plan on the server,
// and the form kept only the vet's text, so Save wiped the plan.
test('a plan added by the recording survives the vet editing the same field', () => {
  const previous = { treatment_notes: 'Small animal consultation performed.', findings: '' };
  const local = { treatment_notes: 'Small animal consultation performed.\nVetacortyl injected, hyperkeratotic tissue removed.', findings: '' };
  const server = {
    treatment_notes: 'Small animal consultation performed.\n\nVetacortyl repeated today. Continue every 3 weeks until stable, then lengthen the interval.',
    findings: 'Toe swelling reduced further.',
  };
  const merged = mergeRecordFields(local, previous, server);
  assert.match(merged.treatment_notes, /Vetacortyl injected, hyperkeratotic tissue removed\./);
  assert.match(merged.treatment_notes, /Continue every 3 weeks until stable/);
  assert.equal(merged.findings, 'Toe swelling reduced further.'); // untouched field: the server's
});

test('an empty field filled by the recording joins what the vet typed', () => {
  const merged = mergeRecordFields({ treatment_notes: 'Typed by hand.' }, { treatment_notes: '' }, { treatment_notes: 'From the recording.' });
  assert.equal(merged.treatment_notes, 'Typed by hand.\n\nFrom the recording.');
});

test('nothing is doubled, and a real conflict keeps the vet edit', () => {
  assert.equal(mergeRecordFields({ a: 'x\n\nadded' }, { a: 'x' }, { a: 'x\n\nadded' }).a, 'x\n\nadded');
  assert.equal(mergeRecordFields({ a: 'mine' }, { a: 'old' }, { a: 'rewritten' }).a, 'mine');
  assert.equal(mergeRecordFields({ a: 'mine' }, { a: 'old' }, { a: 'old' }).a, 'mine');
  assert.deepEqual(mergeRecordFields(null, null, { a: 'srv' }), { a: 'srv' });
});
