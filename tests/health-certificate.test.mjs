import test from 'node:test';
import assert from 'node:assert/strict';
import { ageOn, isIsoMicrochip, certificateVaccines, buildCertificateData, sexLabel } from '../lib/healthCertificate.js';

const protocols = [
  { id: 'pch', name: 'PCH (Feline Flu + Enteritis)', core: true, is_rabies: false },
  { id: 'rab', name: 'Rabies', core: true, is_rabies: true },
];

test('microchip: 15 digits is ISO 11784/11785', () => {
  assert.ok(isIsoMicrochip('784219001931217'));
  assert.ok(!isIsoMicrochip('9851210'));
  assert.ok(!isIsoMicrochip(''));
});

test('age on the exam date', () => {
  assert.equal(ageOn('2026-06-20', '2026-10-27'), '4 months');
  assert.equal(ageOn('2024-07-01', '2026-10-27'), '2 years 3 months');
  assert.equal(ageOn(null, '2026-10-27'), null);
});

test('rabies first, latest dose of each vaccine, with its product and validity', () => {
  const vaccinations = [
    { vaccine_protocol_id: 'rab', vaccine_name: 'Rabies', date_given: '2025-09-29', next_due_date: '2026-09-29', batch_number: 'OLD' },
    { vaccine_protocol_id: 'rab', vaccine_name: 'Rabies', date_given: '2026-09-29', next_due_date: '2027-09-29', batch_number: '746032A' },
    { vaccine_protocol_id: 'pch', vaccine_name: 'PCH', date_given: '2026-09-29', next_due_date: '2027-09-29' },
    { vaccine_protocol_id: 'rab', vaccine_name: 'Rabies', date_given: null, next_due_date: '2026-11-01' },
  ];
  const v = certificateVaccines({ vaccinations, protocols, species: 'cat', examDate: '2026-10-27', travelDate: '2026-10-30' });
  assert.equal(v.rows[0].kind, 'rabies');
  assert.equal(v.rows[0].batch, '746032A');
  assert.equal(v.rows[0].product, 'Biocan R (Bioveta)');
  assert.equal(v.rows[1].product, 'Biofel PCH (Bioveta)');
  assert.deepEqual(v.warnings, []);
});

test('rabies less than 21 days before travel, or expired, is flagged', () => {
  const soon = certificateVaccines({ vaccinations: [{ vaccine_protocol_id: 'rab', date_given: '2026-10-20', next_due_date: '2027-10-20' }], protocols, species: 'dog', examDate: '2026-10-27', travelDate: '2026-11-01' });
  assert.match(soon.warnings[0], /less than 21 days/);
  const old = certificateVaccines({ vaccinations: [{ vaccine_protocol_id: 'rab', date_given: '2025-01-01', next_due_date: '2026-01-01' }], protocols, species: 'dog', examDate: '2026-10-27' });
  assert.match(old.warnings[0], /expired/);
  const none = certificateVaccines({ vaccinations: [], protocols, species: 'dog', examDate: '2026-10-27' });
  assert.match(none.warnings[0], /No rabies/);
});

test('the certificate data, with what is missing flagged', () => {
  const data = buildCertificateData({
    patient: { name: 'Barni', species: 'cat', sex: 'male_castrated', color: 'White', microchip_number: '784219001931217', microchip_implanted_at: '2026-09-28', date_of_birth: '2026-01-15' },
    client: { full_name: 'Test Owner', address: 'Sharjah', phone: '+971500000000' },
    clinic: { legal_name: 'Europets Veterinary Clinic' },
    vet: { full_name: 'Dr. Test Vet', licence_number: '' },
    vaccinations: [{ vaccine_protocol_id: 'rab', date_given: '2026-09-29', next_due_date: '2027-09-29' }],
    protocols,
    form: { exam_date: '2026-10-27', destination: 'Netherlands', internal_product: 'Milbemax', internal_date: '2026-10-27' },
  });
  assert.equal(data.animal.sex, 'Male, neutered');
  assert.equal(data.animal.age, '9 months');
  assert.ok(data.microchip.iso);
  assert.equal(data.travel.destination, 'Netherlands');
  assert.match(data.travel.visited, /United Arab Emirates/);
  assert.deepEqual(data.warnings, ["The signing vet's licence number isn't on their staff profile."]);
  assert.equal(sexLabel('female_spayed'), 'Female, spayed');
});
