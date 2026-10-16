import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../app/api/client-messages/unmatched/[phone]/route.js', import.meta.url), 'utf8'))
  .replace(/^import [\s\S]*?;\n/gm, '')
  .replace(/export /g, '');

function load({ lastInboundAgoMs = null } = {}) {
  const sent = { text: [], template: [], inserted: [] };
  const query = (table) => {
    const q = {
      select: () => q, eq: () => q, order: () => q, limit: () => q, is: () => q,
      maybeSingle: async () => ({ data: lastInboundAgoMs === null ? null : { created_at: new Date(Date.now() - lastInboundAgoMs).toISOString() } }),
      insert: (rows) => { sent.inserted.push(...rows); return { select: () => ({ single: async () => ({ data: rows[0] }) }) }; },
    };
    return q;
  };
  const deps = {
    NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) },
    supabaseAdmin: { from: query },
    sendWhatsAppText: async (phone, text) => { sent.text.push(phone); return 'wamid.text'; },
    sendFirstContactMessage: async (phone, opts) => { sent.template.push({ phone, ...opts }); return 'wamid.tpl'; },
    whatsappDigits: (p) => { let d = String(p).replace(/\D/g, ''); if (d.startsWith('0')) d = '971' + d.slice(1); return d; },
    withoutDashes: (t) => t,
    ensureWhatsAppNumberOnFile: async () => {},
  };
  const fns = new Function(...Object.keys(deps), `${source}\nreturn { POST };`)(...Object.values(deps));
  return { POST: (phone, body) => fns.POST({ json: async () => body }, { params: { phone } }), sent };
}

test('someone who has never written gets the first-contact template', async () => {
  const { POST, sent } = load();
  const res = await POST('0561036073', { body: 'Hi Sarah', staff_id: 's1', client_name: 'sarah evans' });
  assert.equal(res.status, 201);
  assert.equal(sent.template.length, 1);
  assert.equal(sent.template[0].phone, '971561036073');
  assert.equal(sent.template[0].clientName, 'sarah evans');
  assert.equal(sent.text.length, 0);
  assert.equal(sent.inserted[0].phone, '971561036073');
});

test('within 24 hours of their last message it is a normal reply', async () => {
  const { POST, sent } = load({ lastInboundAgoMs: 60 * 60 * 1000 });
  await POST('971509600099', { body: 'See you at 5:30', staff_id: 's1' });
  assert.equal(sent.text.length, 1);
  assert.equal(sent.template.length, 0);
});

test('after 24 hours it switches back to the template', async () => {
  const { POST, sent } = load({ lastInboundAgoMs: 25 * 60 * 60 * 1000 });
  await POST('971509600099', { body: 'Following up', staff_id: 's1' });
  assert.equal(sent.template.length, 1);
});
