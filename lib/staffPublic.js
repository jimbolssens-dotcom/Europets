// lib/staffPublic.js
// A staff row as the browser may see it: never the login code's hash
// (migration 225), only whether there is one.

export function publicStaff(row) {
  if (!row) return row;
  const { login_code_hash, ...rest } = row;
  return { ...rest, has_login_code: !!login_code_hash };
}
