import test from 'node:test';
import assert from 'node:assert/strict';
import { petListText, secondLookPrompt } from '../lib/conciergeSecondLook.js';

// 7eabe1e3, 28 Oct 21:36: "book my dogs taco and waffle with Dr Jim on
// Monday". Both are on file, but the reply went out saying Taco "isn't on
// our records yet" with a registration form: the second look wasn't shown
// the pet list, and its rule says to send the form for a pet not on file.
test('the second look sees the same pets on file as the AI', () => {
  const petList = petListText([
    { name: 'Oreo', species: 'dog' },
    { name: 'Taco', species: 'dog', sex: 'male' },
    { name: 'Waffle', species: 'dog' },
  ]);
  const prompt = secondLookPrompt({
    situation: 'The clinic is closed until 8:00.',
    facts: '',
    petList,
    transcript: 'Client: Hi, I would like to book an appointment for my dogs taco and waffle with Dr Jim on Monday morning please',
    draft: 'Send this reply: "Dr. Jim has these Monday times for Taco and Waffle: 10:15, 10:30"',
  });
  assert.match(prompt, /This client's pets on file:\n- Oreo \(dog\)\n- Taco \(dog, male\)\n- Waffle \(dog\)/);
  assert.match(prompt, /a pet in that list is on file: never send it the form/);
});

test('no pets, or a number not on file, says so', () => {
  assert.equal(petListText([]), '(none on file yet)');
  assert.equal(petListText([], true), "(this number isn't linked to a client on file)");
});
