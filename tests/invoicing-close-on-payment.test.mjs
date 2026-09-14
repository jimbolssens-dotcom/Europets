import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Same "strip imports, eval as a function taking its imports as
// parameters" pattern as the other tests here (see
// consult-hospitalization.test.mjs) — lets this exercise the real source
// of lib/invoicing.js without lib/consultCompletion.js and
// lib/hospitalizationDischarge.js's own imports (Anthropic, Storage)
// actually running.
const source = (await readFile(new URL('../lib/invoicing.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '')
  .replace(/export /g, '');

function loadInvoicing({ runConsultCompletionEffects, runHospitalizationDischargeEffects }) {
  return new Function(
    'ADMINISTRATION_METHOD_CODES',
    'runConsultCompletionEffects',
    'runHospitalizationDischargeEffects',
    source + '\nreturn { recomputeInvoicePayments };'
  )({}, runConsultCompletionEffects, runHospitalizationDischargeEffects);
}

// A minimal fake matching the exact call shapes lib/invoicing.js uses:
// .from(table).select(...).eq(...).single()/.maybeSingle(), and
// .from(table).update(...).eq(...) awaited directly or chained into
// .select().single(). Records every operation in `calls` for assertions.
function makeSupabase(db, calls) {
  return {
    from(table) {
      const state = { table, op: null, payload: null, filters: {} };
      const builder = {
        select() {
          state.op = state.op || 'select';
          return builder;
        },
        update(payload) {
          state.op = 'update';
          state.payload = payload;
          return builder;
        },
        eq(col, val) {
          state.filters[col] = val;
          return builder;
        },
        single: () => Promise.resolve(resolve()),
        maybeSingle: () => Promise.resolve(resolve()),
        then: (res, rej) => Promise.resolve(resolve()).then(res, rej),
      };

      function resolve() {
        calls.push({ table, op: state.op, filters: { ...state.filters }, payload: state.payload });
        if (state.op === 'update') {
          const row = db[table]?.find((r) => r.id === state.filters.id);
          if (row) Object.assign(row, state.payload);
          return { data: row ? { ...row } : null, error: null };
        }
        if (table === 'invoice_payments') {
          return { data: db.invoice_payments.filter((p) => p.invoice_id === state.filters.invoice_id), error: null };
        }
        const row = db[table]?.find((r) => r.id === state.filters.id);
        return { data: row ? { ...row } : null, error: null };
      }

      return builder;
    },
  };
}

test('an invoice paid in full completes its linked consult and discharges its linked hospitalization', async () => {
  const calls = [];
  const completedVisits = [];
  const dischargedHospitalizations = [];
  const { recomputeInvoicePayments } = loadInvoicing({
    runConsultCompletionEffects: async (supabase, visit) => completedVisits.push(visit.id),
    runHospitalizationDischargeEffects: async (supabase, id) => dischargedHospitalizations.push(id),
  });

  const db = {
    invoices: [{ id: 'inv1', total: 100, status: 'partially_paid', visit_id: 'visit1', hospitalization_id: 'hosp1' }],
    invoice_payments: [{ amount: 100, paid_at: '2026-01-01T00:00:00Z' }],
    visits: [{ id: 'visit1', status: 'in_progress' }],
    hospitalizations: [{ id: 'hosp1', status: 'admitted' }],
  };
  db.invoice_payments[0].invoice_id = 'inv1';

  const supabase = makeSupabase(db, calls);
  const { data, error } = await recomputeInvoicePayments(supabase, 'inv1');

  assert.equal(error, null);
  assert.equal(data.status, 'paid');
  assert.equal(db.visits[0].status, 'complete');
  assert.ok(db.visits[0].ended_at, 'ended_at should be stamped');
  assert.equal(db.hospitalizations[0].status, 'discharged');
  assert.ok(db.hospitalizations[0].discharged_at, 'discharged_at should be stamped');
  assert.deepEqual(completedVisits, ['visit1']);
  assert.deepEqual(dischargedHospitalizations, ['hosp1']);
});

test('a consult already complete and a hospitalization already discharged are left alone', async () => {
  const calls = [];
  const completedVisits = [];
  const dischargedHospitalizations = [];
  const { recomputeInvoicePayments } = loadInvoicing({
    runConsultCompletionEffects: async (supabase, visit) => completedVisits.push(visit.id),
    runHospitalizationDischargeEffects: async (supabase, id) => dischargedHospitalizations.push(id),
  });

  const db = {
    invoices: [{ id: 'inv1', total: 100, status: 'partially_paid', visit_id: 'visit1', hospitalization_id: 'hosp1' }],
    invoice_payments: [{ amount: 100, paid_at: '2026-01-01T00:00:00Z', invoice_id: 'inv1' }],
    visits: [{ id: 'visit1', status: 'complete', ended_at: 'already-set' }],
    hospitalizations: [{ id: 'hosp1', status: 'discharged', discharged_at: 'already-set' }],
  };

  const supabase = makeSupabase(db, calls);
  await recomputeInvoicePayments(supabase, 'inv1');

  assert.deepEqual(completedVisits, []);
  assert.deepEqual(dischargedHospitalizations, []);
  assert.equal(db.visits[0].ended_at, 'already-set');
  assert.equal(db.hospitalizations[0].discharged_at, 'already-set');
});

test('an invoice already fully paid before this recompute does not re-trigger closing', async () => {
  const calls = [];
  const completedVisits = [];
  const { recomputeInvoicePayments } = loadInvoicing({
    runConsultCompletionEffects: async (supabase, visit) => completedVisits.push(visit.id),
    runHospitalizationDischargeEffects: async () => {},
  });

  const db = {
    invoices: [{ id: 'inv1', total: 100, status: 'paid', visit_id: 'visit1', hospitalization_id: null }],
    invoice_payments: [{ amount: 100, paid_at: '2026-01-01T00:00:00Z', invoice_id: 'inv1' }],
    visits: [{ id: 'visit1', status: 'in_progress' }],
    hospitalizations: [],
  };

  const supabase = makeSupabase(db, calls);
  await recomputeInvoicePayments(supabase, 'inv1');

  assert.deepEqual(completedVisits, []);
  assert.equal(db.visits[0].status, 'in_progress');
});

test('a partial payment never closes the linked consult', async () => {
  const calls = [];
  const completedVisits = [];
  const { recomputeInvoicePayments } = loadInvoicing({
    runConsultCompletionEffects: async (supabase, visit) => completedVisits.push(visit.id),
    runHospitalizationDischargeEffects: async () => {},
  });

  const db = {
    invoices: [{ id: 'inv1', total: 100, status: 'unpaid', visit_id: 'visit1', hospitalization_id: null }],
    invoice_payments: [{ amount: 40, paid_at: '2026-01-01T00:00:00Z', invoice_id: 'inv1' }],
    visits: [{ id: 'visit1', status: 'in_progress' }],
    hospitalizations: [],
  };

  const supabase = makeSupabase(db, calls);
  const { data } = await recomputeInvoicePayments(supabase, 'inv1');

  assert.equal(data.status, 'partially_paid');
  assert.deepEqual(completedVisits, []);
  assert.equal(db.visits[0].status, 'in_progress');
});
