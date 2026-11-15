// Surgical/dental report instructions (Jim, 15 Nov): the report was
// leaving out materials and technical detail. These pin the rules that fix it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { procedureReportSystemPrompt } from '../lib/procedureReportPrompt.js';

const p = procedureReportSystemPrompt('surgical procedure');

test('every dictated detail must appear, technical or not', () => {
  assert.match(p, /Every detail in the vet's notes below must appear/);
  assert.match(p, /Never leave something out or summarise it away because it sounds technical/);
  assert.match(p, /implants and materials/);
  assert.match(p, /suture material, size and pattern/);
});

test('proper terms kept, explained for the owner, presentable to other clinics', () => {
  assert.match(p, /shown to other clinics/);
  assert.match(p, /without dropping the term itself/);
  assert.doesNotMatch(p, /no clinical jargon/i);
});

test('still nothing invented', () => {
  assert.match(p, /never invent findings, materials, doses or outcomes/);
});

test('the dental chart rule is kept for dental reports', () => {
  assert.match(procedureReportSystemPrompt('dental procedure', ' DENTAL-RULE'), /DENTAL-RULE/);
});
