// app/api/accounting/legacy-payments-import/route.js
// POST { rows: [{ client_number, amount, paid_at, note }], apply? } ->
// bulk-import old-system payment records into legacy_payments (see
// app/(admin)/accounting/legacy-payments-import) from a pasted/uploaded
// export like the old system's own transfer log — a big batch at once
// instead of one-by-one through a client's own "Record payment" form.
//
// Deliberately NEVER touches clients.legacy_outstanding_balance — per
// standing instruction, that figure is only ever touched by a deliberate,
// exact correction (a client's own "Correct this number" link, or the
// Bulk-Correct Old Balances tool), never derived from an import. This
// tool only adds rows to the payment log itself for the record.
//
// Three passes protect against the same failure modes that bit the very
// first hand-written-SQL version of this import:
//   1. exact duplicates WITHIN the pasted batch (same client_number,
//      amount, paid_at, note) are collapsed to one — the source export
//      itself turned out to contain the same transfer logged twice in
//      several places.
//   2. rows that match a payment ALREADY in legacy_payments for that
//      client (same client_id, amount, paid_at) are skipped — so
//      re-running this tool, or a batch that overlaps an earlier import,
//      never creates a second row for the same real payment.
//   3. client_number lookups are chunked (Supabase's default 1000-row cap
//      on an unordered .in() otherwise silently drops real matches on a
//      large batch and misreports them as not found).
//
// apply=false (or omitted) resolves everything and returns what WOULD be
// inserted, touching nothing. apply=true does the same resolution and
// then actually inserts the ready rows.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

// A large apply (a thousand-plus rows) can otherwise run past the
// default serverless function timeout — see
// app/api/hospitalizations/[id]/route.js for the same reasoning.
export const maxDuration = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const apply = body.apply === true;

  if (rows.length === 0) {
    return NextResponse.json({ error: 'rows must include at least one entry' }, { status: 400 });
  }

  // First pass: validate shape and collapse exact duplicates within the
  // batch itself. batchKey identifies "the same line pasted/exported
  // more than once"; earlier occurrences win, later ones are marked
  // duplicate_in_batch and never inserted.
  const seenInBatch = new Set();
  const parsed = rows.map((r, index) => {
    const clientNumber = Number(r.client_number);
    const amount = Number(r.amount);
    const paidAt = typeof r.paid_at === 'string' ? r.paid_at.trim() : '';
    const note = typeof r.note === 'string' && r.note.trim() ? r.note.trim() : null;
    if (!Number.isInteger(clientNumber) || !Number.isFinite(amount) || amount <= 0 || !DATE_RE.test(paidAt)) {
      return {
        index,
        client_number: r.client_number,
        amount: r.amount,
        paid_at: r.paid_at,
        note,
        status: 'invalid',
        error: 'invalid client_number, amount, or paid_at (expected YYYY-MM-DD)',
      };
    }
    const batchKey = `${clientNumber}|${amount}|${paidAt}|${note || ''}`;
    if (seenInBatch.has(batchKey)) {
      return { index, client_number: clientNumber, amount, paid_at: paidAt, note, status: 'duplicate_in_batch' };
    }
    seenInBatch.add(batchKey);
    return { index, client_number: clientNumber, amount, paid_at: paidAt, note, status: 'pending' };
  });

  const clientNumbers = [...new Set(parsed.filter((r) => r.status === 'pending').map((r) => r.client_number))];

  // Supabase caps a single request at 1000 rows by default — chunking
  // avoids that cap silently dropping real matches on a large batch. See
  // app/api/accounting/legacy-balance-corrections/route.js for the same
  // pattern (found the hard way there first).
  const CHUNK_SIZE = 300;
  const clientChunks = [];
  for (let i = 0; i < clientNumbers.length; i += CHUNK_SIZE) {
    clientChunks.push(clientNumbers.slice(i, i + CHUNK_SIZE));
  }
  const clientChunkResults = await Promise.all(
    clientChunks.map((chunk) => supabaseAdmin.from('clients').select('id, client_number, full_name').in('client_number', chunk))
  );
  const clientsError = clientChunkResults.find((r) => r.error)?.error;
  if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 });
  const byNumber = new Map(clientChunkResults.flatMap((r) => r.data || []).map((c) => [c.client_number, c]));

  const foundClientIds = [...new Set(parsed.filter((r) => r.status === 'pending' && byNumber.has(r.client_number)).map((r) => byNumber.get(r.client_number).id))];

  // Existing legacy_payments for these clients, to detect "already
  // imported" rows — matched on client_id + amount + paid_at only (not
  // note), since a payment logged through the client page's own form, or
  // an earlier/overlapping import batch, may not carry an identical note.
  const paymentChunks = [];
  for (let i = 0; i < foundClientIds.length; i += CHUNK_SIZE) {
    paymentChunks.push(foundClientIds.slice(i, i + CHUNK_SIZE));
  }
  const paymentChunkResults = await Promise.all(
    paymentChunks.map((chunk) => supabaseAdmin.from('legacy_payments').select('client_id, amount, paid_at').in('client_id', chunk))
  );
  const paymentsError = paymentChunkResults.find((r) => r.error)?.error;
  if (paymentsError) return NextResponse.json({ error: paymentsError.message }, { status: 500 });
  const existingKeys = new Set(
    paymentChunkResults.flatMap((r) => r.data || []).map((p) => `${p.client_id}|${Number(p.amount)}|${p.paid_at}`)
  );

  const results = parsed.map((r) => {
    if (r.status !== 'pending') return r;
    const client = byNumber.get(r.client_number);
    if (!client) {
      return { ...r, status: 'not_found', error: 'no client with this client_number' };
    }
    const existingKey = `${client.id}|${r.amount}|${r.paid_at}`;
    if (existingKeys.has(existingKey)) {
      return { ...r, status: 'already_imported', client_id: client.id, full_name: client.full_name };
    }
    return { ...r, status: 'ready', client_id: client.id, full_name: client.full_name };
  });

  if (!apply) {
    return NextResponse.json({ results });
  }

  const toInsert = results.filter((r) => r.status === 'ready');
  // A single batch .insert() is all-or-nothing for that chunk — if one
  // row in a chunk fails (shouldn't happen given the validation above,
  // but nothing guarantees it can't), the other chunks must still be
  // reported accurately rather than the whole apply aborting and leaving
  // it unclear which rows actually made it in.
  const INSERT_CHUNK_SIZE = 200;
  const insertChunks = [];
  for (let i = 0; i < toInsert.length; i += INSERT_CHUNK_SIZE) {
    insertChunks.push(toInsert.slice(i, i + INSERT_CHUNK_SIZE));
  }
  const chunkOutcomes = await Promise.all(
    insertChunks.map((chunk) =>
      supabaseAdmin
        .from('legacy_payments')
        .insert(chunk.map((r) => ({ client_id: r.client_id, amount: r.amount, paid_at: r.paid_at, note: r.note })))
        .then(({ error }) => ({ chunk, error }))
    )
  );
  const failedIndexes = new Set();
  let firstError = null;
  for (const { chunk, error } of chunkOutcomes) {
    if (error) {
      firstError = firstError || error;
      for (const r of chunk) failedIndexes.add(r.index);
    }
  }

  const applied = results.map((r) => {
    if (r.status !== 'ready') return r;
    if (failedIndexes.has(r.index)) return { ...r, error: 'Insert failed — see server error', applied: false };
    return { ...r, applied: true };
  });
  if (firstError) {
    return NextResponse.json({ error: firstError.message, results: applied }, { status: 500 });
  }
  return NextResponse.json({ results: applied });
}
