// app/api/accounting/legacy-balance-corrections/route.js
// POST { rows: [{ client_number, balance }], apply? } -> bulk-correct
// clients.legacy_outstanding_balance from a pasted client_number/balance
// list (see app/(admin)/accounting/legacy-balance-corrections) — the
// same PATCH a single client's own "Correct this number" link already
// does (app/(admin)/clients/[id]), just applied to many rows in one
// batch after a preview, instead of hand-writing SQL for each one. That
// hand-written-SQL path (a one-time data import gone wrong: typo'd
// client numbers silently matching the wrong real client, a duplicate
// run) is exactly what this exists to stop happening again.
//
// apply=false (or omitted) resolves every row against clients — by
// client_number, the shared numbering scheme this app and the old
// system both use (migration 068) — and returns what WOULD change,
// touching nothing. apply=true does the same resolution and then
// actually writes each matched row's new balance. Always re-resolves
// fresh rather than trusting client_id from an earlier preview call, so
// a client record that changed between preview and apply can't cause a
// stale write.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const apply = body.apply === true;

  const clientNumbers = rows
    .map((r) => Number(r.client_number))
    .filter((n) => Number.isInteger(n));
  if (clientNumbers.length === 0) {
    return NextResponse.json({ error: 'rows must include at least one valid client_number' }, { status: 400 });
  }

  const { data: clients, error: clientsError } = await supabaseAdmin
    .from('clients')
    .select('id, client_number, full_name, legacy_outstanding_balance')
    .in('client_number', clientNumbers);
  if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 });

  const byNumber = new Map((clients || []).map((c) => [c.client_number, c]));

  const results = rows.map((r) => {
    const clientNumber = Number(r.client_number);
    const newBalance = Number(r.balance);
    if (!Number.isInteger(clientNumber) || !Number.isFinite(newBalance) || newBalance < 0) {
      return { client_number: r.client_number, found: false, error: 'invalid client_number or balance' };
    }
    const client = byNumber.get(clientNumber);
    if (!client) {
      return { client_number: clientNumber, found: false, error: 'no client with this client_number' };
    }
    return {
      client_number: clientNumber,
      found: true,
      client_id: client.id,
      full_name: client.full_name,
      current_balance: client.legacy_outstanding_balance,
      new_balance: newBalance,
    };
  });

  if (!apply) {
    return NextResponse.json({ results });
  }

  const applied = [];
  for (const r of results) {
    if (!r.found) {
      applied.push(r);
      continue;
    }
    const { error: updateError } = await supabaseAdmin
      .from('clients')
      .update({ legacy_outstanding_balance: r.new_balance })
      .eq('id', r.client_id);
    applied.push(updateError ? { ...r, error: updateError.message } : { ...r, applied: true });
  }

  return NextResponse.json({ results: applied });
}
