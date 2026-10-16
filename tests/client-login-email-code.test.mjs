import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../app/api/client-app/auth/request-code/route.js', import.meta.url), 'utf8'))
  .replace(/^import [\s\S]*?;\n/gm, '')
  .replace(/export /g, '');

function load({ emails = [], whatsappFails = false } = {}) {
  const sent = { emails: [], whatsapp: [] };
  const deps = {
    NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) },
    normalizePhoneDigits: (p) => String(p).replace(/\D/g, ''),
    findClientsByPhone: async () => [{ id: 'c1' }],
    generateOtpCode: () => '123456',
    storeOtpCode: async () => {},
    sendWhatsAppOtp: async (phone) => { if (whatsappFails) throw new Error('not on WhatsApp'); sent.whatsapp.push(phone); },
    isWhatsAppConfigured: () => true,
    checkRateLimit: () => ({ blocked: false }),
    recordFailedAttempt: () => {},
    getClientKey: () => 'ip',
    supabaseAdmin: { from: () => ({ select: () => ({ in: async () => ({ data: emails.map((email) => ({ email })) }) }) }) },
    sendEmail: async (msg) => sent.emails.push(msg),
  };
  const POST = new Function(...Object.keys(deps), `${source}\nreturn POST;`)(...Object.values(deps));
  const call = (body) => POST({ json: async () => body });
  return { call, sent };
}

test('email channel sends the code to each address on file, masked in the reply', async () => {
  const { call, sent } = load({ emails: ['jane.doe@gmail.com', 'JANE.DOE@gmail.com ', 'sam@x.ae'] });
  const res = await call({ phone: '+971501234567', channel: 'email' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.sentTo, ['ja***@gmail.com', 'sa***@x.ae']);
  assert.equal(sent.emails.length, 2);
  assert.match(sent.emails[0].text, /123456/);
  assert.equal(sent.whatsapp.length, 0);
});

test('email channel with no email on file says so', async () => {
  const { call, sent } = load({ emails: ['', 'not-an-email'] });
  const res = await call({ phone: '+971501234567', channel: 'email' });
  assert.equal(res.status, 404);
  assert.equal(res.body.noEmail, true);
  assert.equal(sent.emails.length, 0);
});

test('WhatsApp stays the default', async () => {
  const { call, sent } = load({ emails: ['jane@gmail.com'] });
  const res = await call({ phone: '+971501234567' });
  assert.equal(res.body.channel, 'whatsapp');
  assert.equal(sent.whatsapp.length, 1);
  assert.equal(sent.emails.length, 0);
});

test('a failed WhatsApp send falls back to email', async () => {
  const { call, sent } = load({ emails: ['jane@gmail.com'], whatsappFails: true });
  const res = await call({ phone: '+971501234567' });
  assert.equal(res.body.channel, 'email');
  assert.equal(sent.emails.length, 1);
});

test('a failed WhatsApp send with no email still reports the error', async () => {
  const { call } = load({ emails: [], whatsappFails: true });
  const res = await call({ phone: '+971501234567' });
  assert.equal(res.status, 500);
});
