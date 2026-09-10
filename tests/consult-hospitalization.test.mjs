import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../app/api/hospitalizations/route.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replace(/export /g, '');
const response = { json: (body, options = {}) => ({ body, status: options.status || 200 }) };

test('repeat admission opens the matching active hospitalization without creating another', async () => {
  const existing = { id: 'active-stay', status: 'admitted' };
  const supabase = { from(table) {
    assert.equal(table, 'hospitalizations');
    const query = {
      select() { return query; },
      eq(column, value) {
        assert.equal(column, 'originating_visit_id');
        assert.equal(value, 'consult-1');
        return query;
      },
      async order() { return { data: [{ id: 'old-stay', status: 'discharged' }, existing] }; },
    };
    return query;
  } };
  const post = new Function('supabase', 'NextResponse', 'attachCages', source + '\nreturn POST;')(supabase, response, (value) => value);
  const result = await post({ json: async () => ({ originating_visit_id: 'consult-1' }) });
  assert.equal(result.status, 200);
  assert.equal(result.body.id, 'active-stay');
});

test('a failed existing-admission lookup blocks booking instead of risking a duplicate', async () => {
  const query = { select() { return query; }, eq() { return query; }, async order() { return { error: new Error('offline') }; } };
  const post = new Function('supabase', 'NextResponse', 'attachCages', source + '\nreturn POST;')(
    { from: () => query }, response, (value) => value,
  );
  const result = await post({ json: async () => ({ originating_visit_id: 'consult-1' }) });
  assert.equal(result.status, 500);
});
