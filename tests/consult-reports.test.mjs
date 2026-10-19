import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
const pure = async (path) => import('data:text/javascript;base64,' + Buffer.from(await read(path)).toString('base64'));
const { formatConsultReportSources } = await pure('lib/consultReportSources.js');
const { isImagingDiagnostic, DIAGNOSTIC_ABNORMALITIES_FROM_DOCUMENT_INSTRUCTIONS } = await pure('lib/diagnosticReportPolicy.js');
const next = { json: (body, options = {}) => ({ body, status: options.status || 200 }) };
async function route(path, dependencies) {
  const source = (await read(path)).replace(/^import .*;\n/gm, '').replace(/export /g, '');
  return new Function(...Object.keys(dependencies), source + '\nreturn POST;')(...Object.values(dependencies));
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

// "AI interpretation" of a test (app/api/diagnostics/[id]/extract-result):
// it reads the file already attached to the diagnostic (not an upload),
// and keeps only the abnormal findings. A fake for the three tables it
// touches: the diagnostic (read with the public client), its attachments
// and the diagnostic update (both through supabaseAdmin).
function labDatabase(row, attachments = []) {
  const updates = [];
  const tables = [];
  const client = {
    from(table) {
      tables.push(table);
      let update;
      const query = {
        select() { return query; },
        eq() { return query; },
        order() { return query; },
        async limit() { return { data: attachments, error: null }; },
        update(value) { update = value; updates.push(value); return query; },
        async single() { return { data: update ? { ...row, ...update } : row, error: null }; },
      };
      return query;
    },
  };
  return { client, updates, tables };
}

async function extractRoute(db, overrides = {}) {
  return route('app/api/diagnostics/[id]/extract-result/route.js', {
    supabase: db.client,
    supabaseAdmin: db.client,
    NextResponse: next,
    isImagingDiagnostic,
    fetchAttachmentBytes: async () => ({ bytes: Buffer.from('%PDF'), contentType: 'application/pdf' }),
    extractDiagnosticAbnormalities: async () => 'WBC: high (20, ref 6-17)',
    convert: () => assert.fail('A PDF must not be converted'),
    ...overrides,
  });
}

test('stored imaging identity blocks AI before file bytes are read, even with misleading hint', async () => {
  for (const row of [{ type: 'xray' }, { type: 'x_ray' }, { goods_services: { name: 'Abdominal ultrasound' } }, { goods_services: { name: 'Thoracic radiographs' } }]) {
    const db = labDatabase(row, [{ file_path: 'x', file_name: 'scan.jpg' }]);
    const post = await extractRoute(db, {
      fetchAttachmentBytes: () => assert.fail('Imaging bytes must not be read'),
      extractDiagnosticAbnormalities: () => assert.fail('Imaging must not reach AI'),
      convert: () => assert.fail('Imaging must not be converted'),
    });
    const response = await post({ json: async () => ({ test_name: 'Blood test' }) }, { params: { id: 'test' } });
    assert.equal(response.status, 409);
    assert.equal(db.updates.length, 0);
    assert.deepEqual(db.tables, ['diagnostics'], 'stops before even looking up the attachment');
  }
});

test('lab interpretation keeps earlier results and updates only its diagnostic', async () => {
  const db = labDatabase({ type: 'blood_test', result: 'Earlier result' }, [{ file_path: 'lab.pdf', file_name: 'lab.pdf', content_type: 'application/pdf' }]);
  const post = await extractRoute(db, {
    extractDiagnosticAbnormalities: async (bytes, mime) => {
      assert.equal(mime, 'application/pdf');
      return 'WBC: high (20, ref 6-17)';
    },
  });
  const response = await post({ json: async () => ({}) }, { params: { id: 'test' } });
  assert.equal(response.status, 200);
  assert.match(response.body.result, /^Earlier result\n\nWBC: high/);
  assert.equal(db.updates.length, 1);
});

test('with no file attached nothing is sent to the AI', async () => {
  const db = labDatabase({ type: 'blood_test', result: 'WBC 20 H' }, []);
  const post = await extractRoute(db, {
    fetchAttachmentBytes: () => assert.fail('Nothing to read'),
    extractDiagnosticAbnormalities: () => assert.fail('Nothing to send to the AI'),
  });
  const response = await post({ json: async () => ({}) }, { params: { id: 'test' } });
  assert.equal(response.status, 400);
  assert.equal(db.updates.length, 0);
});

test('lab model gets factual-only rules, PDF document input, and rejects truncation', async () => {
  const source = await read('lib/anthropicClient.js');
  const start = source.indexOf('export async function extractDiagnosticAbnormalities(');
  const end = source.indexOf('\nexport ', start + 10);
  const body = source.slice(start, end === -1 ? undefined : end).replace('export ', '');
  let payload;
  let stop = 'end_turn';
  const extract = new Function('anthropic', 'DIAGNOSTIC_ABNORMALITIES_FROM_DOCUMENT_INSTRUCTIONS', body + '\nreturn extractDiagnosticAbnormalities;')({
    messages: { create: async (input) => { payload = input; return { content: [{ type: 'text', text: 'ALT: high' }], stop_reason: stop }; } },
  }, DIAGNOSTIC_ABNORMALITIES_FROM_DOCUMENT_INSTRUCTIONS);
  assert.equal(await extract(Buffer.from('sample'), 'application/pdf', 'CBC'), 'ALT: high');
  assert.equal(payload.messages[0].content[0].type, 'document');
  assert.match(payload.system, /Do not diagnose/);
  assert.match(payload.system, /Never supply reference ranges/);
  assert.match(payload.system, /never include the patient's name/);
  stop = 'max_tokens';
  await assert.rejects(extract(Buffer.from('sample'), 'image/png', 'CBC'), /too long/);
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
