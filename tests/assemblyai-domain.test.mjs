import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// lib/assemblyai.js imports the database client, so its small rule is
// checked from the source.
const src = readFileSync(new URL('../lib/assemblyai.js', import.meta.url), 'utf8');
const rule = new RegExp(src.match(/return \/(.+)\/i\.test\(String\(message/)[1], 'i');

test('a refused Vet Mode is recognised, other errors are not', () => {
  assert.ok(rule.test('Invalid domain: veterinary-v1'));
  assert.ok(rule.test('The domain parameter is not supported for speech_model universal'));
  assert.ok(!rule.test('Transcoding failed. File does not appear to contain audio.'));
  assert.ok(!rule.test('Download error, unable to download https://...'));
});

test('Vet Mode is the default and can be switched off', () => {
  assert.match(src, /'veterinary-v1'/);
  assert.match(src, /ASSEMBLYAI_DOMAIN === 'off'/);
});
