import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// website/lib/nomodPayments.js with its imports stripped and the clients
// handed in: two checks of the Settle Your Bill page at the same moment
// (INV-000591 and INV-000984, 1 Nov) must log the payment once.
const source = (await readFile(new URL('../website/lib/nomodPayments.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '')
  .replace(/export /g, '');

function fakeDb() {
  const db = { links: [{ id: 'l1', status: 'pending' }], payments: [], invoices: [{ id: 'inv1', total: 99.75, status: 'unpaid' }] };
  const from = (table) => {
    const st = { table, op: 'select', filters: [], payload: null };
    const run = async () => {
      await new Promise((r) => setTimeout(r, 1));
      if (table === 'nomod_payment_links' && st.op === 'update') {
        const hit = db.links.filter((l) => st.filters.every(([k, v, neg]) => (neg ? l[k] !== v : l[k] === v)));
        hit.forEach((l) => Object.assign(l, st.payload));
        return { data: hit.map((l) => ({ id: l.id })), error: null };
      }
      if (table === 'invoice_payments' && st.op === 'insert') {
        db.payments.push(...st.payload);
        return { data: null, error: null };
      }
      if (table === 'invoice_payments') return { data: db.payments, error: null };
      if (table === 'invoices' && st.op === 'select') return { data: db.invoices[0], error: null };
      return { data: null, error: null };
    };
    const b = {
      select: () => b,
      update: (p) => ((st.op = 'update'), (st.payload = p), b),
      insert: (p) => ((st.op = 'insert'), (st.payload = p), b),
      eq: (k, v) => (st.filters.push([k, v, false]), b),
      neq: (k, v) => (st.filters.push([k, v, true]), b),
      in: () => b,
      order: () => b,
      limit: () => b,
      single: run,
      maybeSingle: run,
      then: (res, rej) => run().then(res, rej),
    };
    return b;
  };
  return { db, client: { from, rpc: async () => ({ data: 1, error: null }) } };
}

test('two checks at once log a Nomod payment once', async () => {
  const { db, client } = fakeDb();
  const mod = new Function('supabaseServer', 'supabaseServerAdmin', 'fetchLink', 'fetchLinkCharges', 'isPaidLinkStatus', source + '\nreturn { recordNomodPayment };')(
    client, client, async () => null, async () => ({ charges: [] }), () => false
  );
  await Promise.all([
    mod.recordNomodPayment({ id: 'l1', amount: 99.75 }, 'inv1'),
    mod.recordNomodPayment({ id: 'l1', amount: 99.75 }, 'inv1'),
  ]);
  assert.equal(db.payments.length, 1);
  assert.equal(db.links[0].status, 'paid');
});
