import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { cvrlFormData, fillCvrlForm, cvrlDefaults, isCvrlTest } from '../lib/cvrlForm.js';

test('which tests get the form, and what is ticked', () => {
  assert.deepEqual(cvrlDefaults('Biopsy'), { samples: ['biopsy'], tests: ['histopathology'] });
  assert.deepEqual(cvrlDefaults('Autopsy Small animal (in house)').tests, ['full_postmortem']);
  assert.ok(isCvrlTest('Histopathology - mass'));
  assert.ok(!isCvrlTest('Bloods GHP'));
});

test('what gets ticked', () => {
  const d = cvrlFormData({ testName: 'Biopsy', patient: { sex: 'female_spayed' } });
  assert.deepEqual([d.samples, d.tests, d.sex], [['biopsy'], ['histopathology'], 'F']);
});

test('fills CVRL\'s own form fields from the case', async () => {
  const data = cvrlFormData({
    diagnostic: { created_at: '2026-11-23T06:30:00Z', description: 'left flank mass' },
    testName: 'Biopsy',
    patient: { name: 'Ginger', patient_number: 23819, species: 'cat', breed: 'DSH', sex: 'female_spayed', date_of_birth: '2023-03-12' },
    client: { full_name: 'Sample Owner' },
    clinic: { legal_name: 'Europets Clinic', phone: '+971 50 000 0000', address: 'Sharjah', email: 'lab@example.com' },
    vetName: 'Dr. Example',
    history: 'Firm 2 cm mass on the left flank, noticed 3 weeks ago.',
  });
  const bytes = await fillCvrlForm(fs.readFileSync(new URL('../assets/cvrl-requisition-form.pdf', import.meta.url)), data, { PDFDocument, StandardFonts });
  const form = (await PDFDocument.load(bytes)).getForm();
  assert.equal(form.getTextField('SENDERS NME').getText(), 'Sample Owner');
  assert.equal(form.getTextField('TRINERS NAME 2').getText(), 'Dr. Example, Europets Clinic');
  assert.equal(form.getTextField('undefined_3').getText(), 'left flank mass');
  assert.equal(form.getTextField('DATE AND TIME OF SAMPLING').getText(), '23/11/2026, 10:30');
  // Ticks are drawn as an X on the page (see fillCvrlForm), not as field values.
  assert.match(form.getTextField('Text2').getText(), /left flank/);
});
