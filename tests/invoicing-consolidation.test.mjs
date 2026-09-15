import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Same "strip imports, eval as a function taking its imports as
// parameters" pattern as tests/invoicing-close-on-payment.test.mjs — lets
// this exercise the real source of lib/invoicing.js without its own
// imports (Anthropic, Storage) actually running.
const source = (await readFile(new URL('../lib/invoicing.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '')
  .replace(/export /g, '');

const ADMINISTRATION_METHOD_CODES = { dispense: 'DIS', sc: 'SC', im: 'IM' };

function loadInvoicing() {
  return new Function(
    'ADMINISTRATION_METHOD_CODES',
    'runConsultCompletionEffects',
    'runHospitalizationDischargeEffects',
    source + '\nreturn { syncInvoiceTreatmentItems, recomputeInvoiceTotals };'
  )(ADMINISTRATION_METHOD_CODES, async () => {}, async () => {});
}

// A small in-memory fake matching the query-builder shapes lib/invoicing.js
// uses: select/insert/update with eq() filters, awaited directly or
// narrowed with single()/maybeSingle().
function makeSupabase(db) {
  return {
    from(table) {
      const filters = [];
      let op = null;
      let payload = null;
      const builder = {
        select() {
          if (!op) op = 'select';
          return builder;
        },
        insert(rows) {
          op = 'insert';
          payload = rows;
          return builder;
        },
        update(p) {
          op = 'update';
          payload = p;
          return builder;
        },
        eq(col, val) {
          filters.push((r) => r[col] === val);
          return builder;
        },
        single: () => exec().then(({ data, error }) => ({ data: Array.isArray(data) ? data[0] ?? null : data, error })),
        maybeSingle: () => exec().then(({ data, error }) => ({ data: Array.isArray(data) ? data[0] ?? null : data, error })),
        then: (res, rej) => exec().then(res, rej),
      };
      function exec() {
        db[table] = db[table] || [];
        if (op === 'insert') {
          const rows = payload.map((r, i) => ({ id: `${table}-${db[table].length + i + 1}`, ...r }));
          db[table].push(...rows);
          return Promise.resolve({ data: rows, error: null });
        }
        if (op === 'update') {
          const matched = db[table].filter((r) => filters.every((f) => f(r)));
          matched.forEach((r) => Object.assign(r, payload));
          return Promise.resolve({ data: matched.map((r) => ({ ...r })), error: null });
        }
        const rows = db[table].filter((r) => filters.every((f) => f(r)));
        return Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null });
      }
      return builder;
    },
  };
}

function makeDb({ scInjectionFee = 5 } = {}) {
  return {
    clinic_settings: [{ id: true, sc_injection_fee: scInjectionFee, im_injection_fee: 0, dispensing_fee: 0 }],
    invoice_line_items: [],
  };
}

const catalog = { id: 'med-1', name: 'Antibiotic IV', base_price: 10 };

function hospItem(id, overrides = {}) {
  return {
    id,
    goods_service_id: catalog.id,
    goods_services: catalog,
    hospitalization_note_id: 'note-1',
    visit_id: null,
    administration_method: 'sc',
    quantity: 1,
    instructions: null,
    billable: true,
    ...overrides,
  };
}

test('the same medication logged on three separate days consolidates onto one line with quantity 3', async () => {
  const { syncInvoiceTreatmentItems } = loadInvoicing();
  const db = makeDb();
  const supabase = makeSupabase(db);

  // Day 1
  await syncInvoiceTreatmentItems(supabase, 'inv1', [hospItem('t1')]);
  // Day 2 — re-sync sees the same item plus a new one from a later day
  await syncInvoiceTreatmentItems(supabase, 'inv1', [hospItem('t1'), hospItem('t2')]);
  // Day 3
  await syncInvoiceTreatmentItems(supabase, 'inv1', [hospItem('t1'), hospItem('t2'), hospItem('t3')]);

  assert.equal(db.invoice_line_items.length, 1, 'still just one line, not one per day');
  const line = db.invoice_line_items[0];
  assert.equal(line.quantity, 3);
  assert.equal(line.line_total, 10 * 3 + 5 * 3, 'medication ×3 plus the SC fee scaled by count (×3)');
  assert.equal(line.description, 'Antibiotic IV (SC ×3)');
  assert.deepEqual(line.source_treatment_item_ids.sort(), ['t1', 't2', 't3']);
});

test('a dispensed medication bills its dispensing fee once no matter how many days it is logged', async () => {
  const { syncInvoiceTreatmentItems } = loadInvoicing();
  const db = makeDb();
  db.clinic_settings[0].dispensing_fee = 2;
  const supabase = makeSupabase(db);

  const dispItem = (id) => hospItem(id, { administration_method: 'dispense' });
  await syncInvoiceTreatmentItems(supabase, 'inv1', [dispItem('t1')]);
  await syncInvoiceTreatmentItems(supabase, 'inv1', [dispItem('t1'), dispItem('t2'), dispItem('t3')]);

  assert.equal(db.invoice_line_items.length, 1);
  const line = db.invoice_line_items[0];
  assert.equal(line.quantity, 3);
  assert.equal(line.line_total, 10 * 3 + 2, 'dispensing fee charged once, not ×3');
  assert.equal(line.description, 'Antibiotic IV (DIS)');
});

test('a re-sync never double-counts an item it already invoiced', async () => {
  const { syncInvoiceTreatmentItems } = loadInvoicing();
  const db = makeDb();
  const supabase = makeSupabase(db);

  await syncInvoiceTreatmentItems(supabase, 'inv1', [hospItem('t1'), hospItem('t2')]);
  const { addedCount } = await syncInvoiceTreatmentItems(supabase, 'inv1', [hospItem('t1'), hospItem('t2')]);

  assert.equal(addedCount, 0, 'nothing new to add on an unchanged re-sync');
  assert.equal(db.invoice_line_items.length, 1);
  assert.equal(db.invoice_line_items[0].quantity, 2);
});

test('different medications and different administration methods never merge into the same line', async () => {
  const { syncInvoiceTreatmentItems } = loadInvoicing();
  const db = makeDb();
  const supabase = makeSupabase(db);
  const otherMed = { id: 'med-2', name: 'Pain Relief', base_price: 4 };

  await syncInvoiceTreatmentItems(supabase, 'inv1', [
    hospItem('t1', { administration_method: 'sc' }),
    hospItem('t2', { administration_method: 'im' }),
    hospItem('t3', { goods_service_id: otherMed.id, goods_services: otherMed, administration_method: 'sc' }),
  ]);

  assert.equal(db.invoice_line_items.length, 3);
});

test("a consult's one-off treatment plan item (no hospitalization_note_id) still gets its own line", async () => {
  const { syncInvoiceTreatmentItems } = loadInvoicing();
  const db = makeDb();
  const supabase = makeSupabase(db);

  await syncInvoiceTreatmentItems(supabase, 'inv1', [
    hospItem('t1', { hospitalization_note_id: null, visit_id: 'visit-1' }),
    hospItem('t2', { hospitalization_note_id: null, visit_id: 'visit-1' }),
  ]);

  assert.equal(db.invoice_line_items.length, 2, 'consult items are not consolidated');
  assert.ok(db.invoice_line_items.every((l) => l.consolidation_key === null));
});

test('a staff rename of the consolidated line survives a later bump, only the fee tag/count updates', async () => {
  const { syncInvoiceTreatmentItems } = loadInvoicing();
  const db = makeDb();
  const supabase = makeSupabase(db);

  await syncInvoiceTreatmentItems(supabase, 'inv1', [hospItem('t1')]);
  db.invoice_line_items[0].description = 'Antibiotic IV — twice daily (SC)';

  await syncInvoiceTreatmentItems(supabase, 'inv1', [hospItem('t1'), hospItem('t2')]);

  const line = db.invoice_line_items[0];
  assert.equal(line.description, 'Antibiotic IV — twice daily (SC ×2)');
  assert.equal(line.quantity, 2);
});

test('an unbillable item is never invoiced', async () => {
  const { syncInvoiceTreatmentItems } = loadInvoicing();
  const db = makeDb();
  const supabase = makeSupabase(db);

  const { addedCount } = await syncInvoiceTreatmentItems(supabase, 'inv1', [hospItem('t1', { billable: false })]);

  assert.equal(addedCount, 0);
  assert.equal(db.invoice_line_items.length, 0);
});
