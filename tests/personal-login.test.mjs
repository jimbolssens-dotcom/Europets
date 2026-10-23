import test from 'node:test';
import assert from 'node:assert/strict';
import { publicStaff } from '../lib/staffPublic.js';

test("the browser never gets a login code's hash, only whether there is one", () => {
  const row = publicStaff({ id: 'a', full_name: 'Intern 1', login_code_hash: 'abc' });
  assert.equal(row.login_code_hash, undefined);
  assert.equal(row.has_login_code, true);
  assert.equal(publicStaff({ id: 'b', login_code_hash: null }).has_login_code, false);
});
