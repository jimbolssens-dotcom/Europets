// Concierge review 23 Nov: two real threads, anonymised.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forWhatsApp } from '../lib/whatsappFormat.js';
import { debounceFor, isBareGreeting, GREETING_DEBOUNCE_MS, DEBOUNCE_MS } from '../lib/conciergeDebounce.js';

test('a booking reply with **bold** days shows as WhatsApp bold, not with the asterisks', () => {
  const sent = 'Dr Jim has these free times:  **Today, Friday 20 Nov** • 10:00 AM • 11:00 AM  **Tomorrow, Saturday 21 Nov** • 10:30 AM';
  assert.equal(forWhatsApp(sent), 'Dr Jim has these free times:  *Today, Friday 20 Nov* • 10:00 AM • 11:00 AM  *Tomorrow, Saturday 21 Nov* • 10:30 AM');
  assert.equal(forWhatsApp('- **[pet]**, staying with us since Wednesday'), '- *[pet]*, staying with us since Wednesday');
  assert.equal(forWhatsApp('### Your booking\nMonday 9:30'), '*Your booking*\nMonday 9:30');
  // Untouched: WhatsApp bold already, prices, a lone asterisk.
  assert.equal(forWhatsApp('*Monday* at 9:30, AED 150 * 2'), '*Monday* at 9:30, AED 150 * 2');
});

test('"Good Evening" waits for the question that follows it 10 seconds later', () => {
  assert.equal(debounceFor('Good Evening'), GREETING_DEBOUNCE_MS);
  assert.ok(GREETING_DEBOUNCE_MS > 10500);
  for (const g of ['Hi', 'hello', 'Hello Dr Jim', 'Good morning!', 'Salam', 'Hi there 👋']) assert.ok(isBareGreeting(g), g);
  for (const q of ['Can I schedule a check up for three of my cats sometime this week', 'Hi, is Dr Jim in today?', 'Good morning, Bella is vomiting'])
    assert.equal(debounceFor(q), DEBOUNCE_MS, q);
});
