import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 26 Oct: "Can I book an appointment for Sage" got "Sage isn't on your file
// with us yet" from a client whose cat was on file. The concierge's pets
// lookup asked for patients.weight_kg, a column that doesn't exist (it's
// current_weight_kg), so the lookup failed and every client read as having
// no pets: nothing could be booked.
const src = readFileSync(new URL('../lib/whatsappConcierge.js', import.meta.url), 'utf8');

test("the concierge's pets lookup asks only for columns patients has", () => {
  const m = src.match(/from\('patients'\)\.select\('([^']+)'\)/);
  assert.ok(m, 'pets lookup not found');
  const cols = m[1].split(',').map((c) => c.trim());
  assert.ok(!cols.includes('weight_kg'), 'patients has no weight_kg column (it is current_weight_kg)');
  assert.ok(cols.includes('current_weight_kg'));
});

test('a failed pets lookup is not read as "no pets on file"', () => {
  assert.match(src, /if \(patientsError\) throw/);
});
