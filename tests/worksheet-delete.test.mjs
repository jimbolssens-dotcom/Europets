import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../app/api/hospitalizations/[id]/notes/[noteId]/route.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replace(/export /g, '');

async function run({ missing = false, fileFailure = false } = {}) {
  const calls = [];
  const supabase = { from(table) {
    const call = { table, filters: [] };
    calls.push(call);
    const query = {
      select() { return query; },
      eq(field, value) { call.filters.push([field, value]); return query; },
      update(values) { call.update = values; return query; },
      delete() { call.deleted = true; return query; },
      async maybeSingle() { return { data: missing ? null : { id: 'note-1' } }; },
      then(resolve) { resolve(fileFailure ? { error: new Error('offline') } : {}); },
    };
    return query;
  } };
  const remove = new Function('supabase', 'NextResponse', source + '\nreturn DELETE;')(
    supabase, { json: (body, options = {}) => ({ body, status: options.status || 200 }) },
  );
  const response = await remove({}, { params: { id: 'stay-1', noteId: 'note-1' } });
  return { response, calls };
}

test('entry deletion is scoped to the hospitalization and preserves files first', async () => {
  const { response, calls } = await run();
  assert.equal(response.status, 200);
  assert.deepEqual(calls.map((call) => call.table), ['hospitalization_notes', 'attachments', 'hospitalization_notes']);
  assert.deepEqual(calls[0].filters, [['id', 'note-1'], ['hospitalization_id', 'stay-1']]);
  assert.deepEqual(calls[1].update, { entity_type: 'hospitalization', entity_id: 'stay-1' });
  assert.deepEqual(calls[1].filters, [['entity_type', 'hospitalization_note'], ['entity_id', 'note-1']]);
  assert.deepEqual(calls[2].filters, calls[0].filters);
  assert.equal(calls[2].deleted, true);
});

test('missing or mismatched entry does not touch files or delete anything', async () => {
  const { response, calls } = await run({ missing: true });
  assert.equal(response.status, 404);
  assert.equal(calls.length, 1);
});

test('file preservation failure prevents entry deletion', async () => {
  const { response, calls } = await run({ fileFailure: true });
  assert.equal(response.status, 500);
  assert.ok(calls.every((call) => !call.deleted));
});
