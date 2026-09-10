import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
const pure = async (path) => import('data:text/javascript;base64,' + Buffer.from(await read(path)).toString('base64'));
const { formatConsultReportSources } = await pure('lib/consultReportSources.js');
const { isImagingDiagnostic, FACTUAL_LAB_INSTRUCTIONS } = await pure('lib/diagnosticReportPolicy.js');
const next = { json: (body, options = {}) => ({ body, status: options.status || 200 }) };
async function route(path, dependencies) {
  const source = (await read(path)).replace(/^import .*;\n/gm, '').replace(/export /g, '');
  return new Function(...Object.keys(dependencies), source + '\nreturn POST;')(...Object.values(dependencies));
}
function database(row) {
  const updates = [];
  return {
    updates,
    from(table) {
      assert.equal(table, 'diagnostics');
      let update;
      const query = {
        select() { return query; },
        eq() { return query; },
        update(value) { update = value; updates.push(value); return query; },
        async single() { return { data: update ? { ...row, ...update } : row }; },
      };
      return query;
    },
  };
}

test('all report types are included, pending reports explicit, attachments excluded', () => {
  const text = formatConsultReportSources({
    diagnostics: [{ goods_services: { name: 'CBC' }, result: 'WBC 20 H', attachments: ['secret-image'] }],
    dental: [{ ai_summary: 'Dental saved report', findings: 'Older dental notes' }],
    surgical: [{ procedure_name: 'Repair', notes: 'Surgical notes' }],
    ultrasound: [{ findings: 'Vet ultrasound findings' }],
    xray: [{}],
  });
  for (const phrase of ['CBC', 'WBC 20 H', 'Dental saved report', 'Surgical notes', 'Vet ultrasound findings', 'Report pending.']) assert.ok(text.includes(phrase));
  assert.ok(!text.includes('secret-image'));
  assert.ok(!text.includes('Older dental notes'));
});

test('stored imaging identity blocks AI before file bytes are read, even with misleading hint', async () => {
  for (const row of [{ type: 'xray' }, { type: 'x_ray' }, { goods_services: { name: 'Abdominal ultrasound' } }, { goods_services: { name: 'Thoracic radiographs' } }]) {
    const db = database(row);
    const post = await route('app/api/diagnostics/[id]/extract-result/route.js', {
      supabase: db, NextResponse: next, isImagingDiagnostic,
      extractDiagnosticResult: () => assert.fail('Imaging must not reach AI'),
      convert: () => assert.fail('Imaging must not be converted'),
    });
    const file = { arrayBuffer: () => assert.fail('Imaging bytes must not be read') };
    const response = await post({ formData: async () => new Map([['image', file], ['test_name', 'Blood test']]) }, { params: { id: 'test' } });
    assert.equal(response.status, 409);
    assert.equal(db.updates.length, 0);
  }
});

test('lab transcription retains earlier results and updates only its diagnostic', async () => {
  const db = database({ type: 'blood_test', result: 'Earlier result' });
  const post = await route('app/api/diagnostics/[id]/extract-result/route.js', {
    supabase: db, NextResponse: next, isImagingDiagnostic,
    extractDiagnosticResult: async (bytes, mime) => { assert.equal(mime, 'application/pdf'); return 'WBC 20 H\nFactual abnormalities: WBC flagged H'; },
    convert: () => assert.fail('PDF must not be converted'),
  });
  const file = { type: 'application/pdf', size: 4, arrayBuffer: async () => Buffer.from('%PDF') };
  const response = await post({ formData: async () => new Map([['image', file]]) }, { params: { id: 'test' } });
  assert.equal(response.status, 200);
  assert.match(response.body.result, /^Earlier result/);
  assert.equal(db.updates.length, 1);
});

test('saved text summary is returned for review without overwriting the source', async () => {
  const db = database({ type: 'blood_test', result: 'WBC 20 H' });
  const post = await route('app/api/diagnostics/[id]/summarize-result/route.js', {
    supabase: db, NextResponse: next, isImagingDiagnostic,
    summarizeLabAbnormalities: async (text) => { assert.equal(text, 'WBC 20 H'); return 'WBC flagged H'; },
  });
  const response = await post({}, { params: { id: 'test' } });
  assert.equal(response.body.summary, 'WBC flagged H');
  assert.equal(db.updates.length, 0);
});

test('lab model gets factual-only rules, PDF document input, and rejects truncation', async () => {
  const source = await read('lib/anthropicClient.js');
  const body = source.slice(source.indexOf('export async function extractDiagnosticResult(')).replace('export ', '');
  let payload;
  let stop = 'end_turn';
  const extract = new Function('anthropic', 'FACTUAL_LAB_INSTRUCTIONS', body + '\nreturn extractDiagnosticResult;')({
    messages: { create: async (input) => { payload = input; return { content: [{ type: 'text', text: 'Results' }], stop_reason: stop }; } },
  }, FACTUAL_LAB_INSTRUCTIONS);
  await extract(Buffer.from('sample'), 'application/pdf', 'CBC');
  assert.equal(payload.messages[0].content[0].type, 'document');
  assert.match(payload.system, /Do not diagnose/);
  assert.match(payload.system, /Never supply reference ranges/);
  stop = 'max_tokens';
  await assert.rejects(extract(Buffer.from('sample'), 'image/png', 'CBC'), /no partial transcription was saved/);
});

test('combined summary loads only the current consult and refuses incomplete source loads', async () => {
  const source = (await read('lib/consultReportGeneration.js')).replace(/^import .*;\n/gm, '').replace(/export /g, '');
  let failed = false;
  let called = false;
  const supabase = {
    from(table) {
      const query = {
        select() { return query; },
        eq(column, value) {
          assert.equal(column, table === 'patients' ? 'id' : 'visit_id');
          assert.equal(value, table === 'patients' ? 'patient-1' : 'visit-1');
          return query;
        },
        async single() { return { data: { name: 'Sample', species: 'dog' } }; },
        then(resolve) { resolve(failed && table === 'xray_reports' ? { error: new Error('offline') } : { data: [{ result: 'Saved result', findings: 'Saved findings' }] }); },
      };
      return query;
    },
  };
  const generate = new Function('supabase', 'generateConsultReport', 'formatConsultReportSources', source + '\nreturn generateReportForConsult;')(
    supabase,
    async (input) => { called = true; assert.match(input.reportSources, /Saved result/); assert.match(input.reportSources, /X-ray/); return 'Combined'; },
    formatConsultReportSources,
  );
  assert.equal(await generate({ id: 'visit-1', patient_id: 'patient-1' }), 'Combined');
  failed = true; called = false;
  await assert.rejects(generate({ id: 'visit-1', patient_id: 'patient-1' }), /Could not load all consult reports/);
  assert.equal(called, false);
});
