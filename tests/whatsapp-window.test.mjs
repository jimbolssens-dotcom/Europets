import test from 'node:test';
import assert from 'node:assert/strict';
import { pickWhatsAppTarget } from '../lib/whatsappWindow.js';

const now = Date.parse('2026-11-25T07:44:35Z');
const ago = (min) => new Date(now - min * 60000).toISOString();
const main = '+971507705471';

test('a client who wrote from their second number gets the reply on that number', () => {
  // Valya, 25 Nov: wrote from her second phone 34 min earlier; main number silent since 18 Nov.
  assert.deepEqual(pickWhatsAppTarget({ mainPhone: main, lastInbound: { created_at: ago(34), phone: '971504596375' }, now }), {
    digits: '971504596375',
    windowOpen: true,
  });
});

test('a client who wrote from their main number gets the reply there', () => {
  assert.deepEqual(pickWhatsAppTarget({ mainPhone: main, lastInbound: { created_at: ago(5), phone: '971507705471' }, now }), {
    digits: '971507705471',
    windowOpen: true,
  });
});

test('after 24 hours the main number gets it, window closed (template)', () => {
  assert.deepEqual(pickWhatsAppTarget({ mainPhone: main, lastInbound: { created_at: ago(24 * 60 + 1), phone: '971504596375' }, now }), {
    digits: '971507705471',
    windowOpen: false,
  });
});

test('a client who never wrote in: main number, window closed', () => {
  assert.deepEqual(pickWhatsAppTarget({ mainPhone: main, lastInbound: null, now }), { digits: '971507705471', windowOpen: false });
});

test('no main number on file: falls back to the number they once wrote from', () => {
  assert.deepEqual(pickWhatsAppTarget({ mainPhone: null, lastInbound: { created_at: ago(3000), phone: '971504596375' }, now }), {
    digits: '971504596375',
    windowOpen: false,
  });
  assert.deepEqual(pickWhatsAppTarget({ mainPhone: '', lastInbound: null, now }), { digits: '', windowOpen: false });
});
