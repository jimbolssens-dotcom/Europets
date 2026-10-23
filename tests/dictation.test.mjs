import test from 'node:test';
import assert from 'node:assert/strict';
import { DICTATION_SYSTEM, buildDictationText } from '../lib/dictationPrompt.js';

test('the AI gets the client, recent messages and what was said', () => {
  const text = buildDictationText({
    transcript: 'um tell her Luna can go home after five today full stop',
    clientName: 'Mrs Sample',
    recent: [{ sender: 'client', body: 'Can Luna come home this evening?' }, { sender: 'staff', body: 'Let me check with the vet.' }],
  });
  assert.match(text, /The client: Mrs Sample\./);
  assert.match(text, /Client: Can Luna come home this evening\?/);
  assert.match(text, /Clinic: Let me check with the vet\./);
  assert.match(text, /What the staff member said: um tell her Luna/);
});

test('the rules keep every fact and add none', () => {
  assert.match(DICTATION_SYSTEM, /Keep every fact/);
  assert.match(DICTATION_SYSTEM, /Never add facts, promises, prices or medical advice/);
  assert.match(DICTATION_SYSTEM, /No long dashes/);
});
