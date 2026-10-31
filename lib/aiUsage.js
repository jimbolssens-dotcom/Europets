// lib/aiUsage.js
// What each Claude call costs, recorded per feature (migration 239,
// ai_usage). Jim asked what was behind the API bill: the Console only shows
// totals, so every call made through lib/anthropicClient.js's `anthropic`
// client now logs its token counts and an estimated cost under a feature
// name, e.g. 'whatsapp-concierge', 'dictation', 'consult-report'.
//
// Callers tag a request with `_feature: '...'`; the wrapper strips it before
// the request goes out (the API would reject an unknown field). It also
// sends effort 'high' when a call doesn't set one: that was Claude Opus 5's
// default, and Claude Opus 5.5 defaults to 'medium', so calls that left it
// out behave as before.

// US dollars per million tokens. Cache writes cost 1.25x the input price
// for a 5-minute entry and 2x for a one-hour entry (the concierge's rules);
// cache reads have their own price.
export const MODEL_PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
};

// usage.cache_creation splits the writes by TTL when the API gives it.
function cacheWriteCost(usage, inputPrice) {
  const split = usage.cache_creation;
  const perMillion = (n, rate) => (Number(n) || 0) * (rate / 1e6);
  if (split && (split.ephemeral_1h_input_tokens != null || split.ephemeral_5m_input_tokens != null)) {
    return perMillion(split.ephemeral_5m_input_tokens, inputPrice * 1.25) + perMillion(split.ephemeral_1h_input_tokens, inputPrice * 2);
  }
  return perMillion(usage.cache_creation_input_tokens, inputPrice * 1.25);
}

export function costFor(model, usage = {}) {
  const price = MODEL_PRICES[model];
  if (!price) return null;
  const perToken = (n, rate) => (Number(n) || 0) * (rate / 1e6);
  const total =
    perToken(usage.input_tokens, price.input) +
    cacheWriteCost(usage, price.input) +
    perToken(usage.cache_read_input_tokens, price.cacheRead) +
    perToken(usage.output_tokens, price.output);
  return Math.round(total * 1e6) / 1e6;
}

export function usageRow(feature, params, response) {
  const usage = response?.usage || {};
  const model = response?.model || params.model;
  return {
    feature: feature || 'untagged',
    model,
    input_tokens: usage.input_tokens || 0,
    output_tokens: usage.output_tokens || 0,
    cache_read_tokens: usage.cache_read_input_tokens || 0,
    cache_write_tokens: usage.cache_creation_input_tokens || 0,
    cost_usd: costFor(model, usage),
  };
}

// The request as it goes to the API: no _feature, and an explicit effort.
export function prepareParams(params) {
  const { _feature, ...rest } = params || {};
  const outputConfig = rest.output_config || {};
  if (!outputConfig.effort) rest.output_config = { ...outputConfig, effort: 'high' };
  return { feature: _feature, request: rest };
}

// Wraps messages.create and messages.parse so each call is logged with
// `log(row)`. A failed log never fails the call.
export function withUsageLogging(client, log) {
  const wrap = (method) => async (params, options) => {
    const { feature, request } = prepareParams(params);
    const response = await method(request, options);
    try {
      await log(usageRow(feature, request, response));
    } catch (err) {
      console.error('AI usage log failed', err?.message || err);
    }
    return response;
  };
  return {
    messages: {
      create: wrap(client.messages.create.bind(client.messages)),
      parse: wrap(client.messages.parse.bind(client.messages)),
    },
  };
}
