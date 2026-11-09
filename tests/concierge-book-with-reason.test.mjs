import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The concierge module pulls in the database client, so the rules are read
// from its source, as they go to the model.
const prompt = readFileSync(new URL('../lib/whatsappConcierge.js', import.meta.url), 'utf8');

// 280652bc, 6 Nov: the client asked for a consult "today 4:45", the AI
// confirmed the slot was free and asked what it was for; "stomach issue"
// made it hand over instead of booking. "Book", "?" got nothing for an
// hour and the client wrote "This ai reply is annoying, I'm coming 4:45".
test('a symptom given as the reason for a chosen free slot is booked, not handed over', () => {
  assert.match(prompt, /A symptom given only as the reason for a consult the client is already booking is still a booking/);
  assert.match(prompt, /unless it's only the reason for a consult they're booking at a free time/);
  // Urgent problems and requests for advice still go to staff.
  assert.match(prompt, /Hand it to staff instead when it could be urgent/);
});
