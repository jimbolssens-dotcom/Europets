import test from 'node:test';
import assert from 'node:assert/strict';
import { costFor, prepareParams, usageRow, withUsageLogging } from '../lib/aiUsage.js';

test('cost counts plain, cached and written input and output at the model price', () => {
  // Claude Opus 5.5: $4 in, $20 out, $0.20 cache read, $5 cache write (per million)
  const cost = costFor('claude-opus-5-5', { input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 });
  assert.equal(cost, 4 + 2 + 0.2 + 5);
  assert.equal(costFor('some-other-model', { input_tokens: 10 }), null);
  // one-hour cache writes cost double the input price
  assert.equal(costFor('claude-opus-5-5', { cache_creation_input_tokens: 1_000_000, cache_creation: { ephemeral_1h_input_tokens: 1_000_000, ephemeral_5m_input_tokens: 0 } }), 8);
});

test('the feature tag never reaches the API, and a call without an effort keeps the old default', () => {
  const { feature, request } = prepareParams({ _feature: 'dictation', model: 'claude-opus-5-5', output_config: { format: { type: 'json_schema' } } });
  assert.equal(feature, 'dictation');
  assert.equal('_feature' in request, false);
  assert.equal(request.output_config.effort, 'high');
  assert.deepEqual(request.output_config.format, { type: 'json_schema' });
  assert.equal(prepareParams({ output_config: { effort: 'low' } }).request.output_config.effort, 'low');
});

test('each call is logged under its feature, and a failed log does not fail the call', async () => {
  const sent = [];
  const logged = [];
  const fake = {
    messages: {
      create: async (req) => { sent.push(req); return { model: 'claude-opus-5-5', usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 900 } }; },
      parse: async () => ({ model: 'claude-opus-5-5', usage: {} }),
    },
  };
  const client = withUsageLogging(fake, async (row) => { logged.push(row); });
  await client.messages.create({ _feature: 'whatsapp-concierge', model: 'claude-opus-5-5' });
  assert.equal(sent[0]._feature, undefined);
  assert.equal(logged[0].feature, 'whatsapp-concierge');
  assert.equal(logged[0].cache_read_tokens, 900);
  const failing = withUsageLogging(fake, async () => { throw new Error('db down'); });
  const res = await failing.messages.create({ model: 'claude-opus-5-5' });
  assert.equal(res.model, 'claude-opus-5-5');
  assert.equal(usageRow(undefined, {}, res).feature, 'untagged');
});
