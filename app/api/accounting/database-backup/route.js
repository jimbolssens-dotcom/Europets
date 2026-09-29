// app/api/accounting/database-backup/route.js
// GET -> a full backup of every table in the database (every client,
// patient, appointment, invoice, treatment record, ...), as a downloadable
// ZIP: one <table>.json per table plus a _manifest.json listing export
// time and row counts. Meant as an independent, offline copy for disaster
// recovery — a Supabase-side incident, an accidental mass-delete, a
// billing lapse — not a live failover (see migration 156-era discussion:
// a real always-in-sync local instance would need its own database and a
// safe conflict-resolution story, which this deliberately isn't).
//
// Table list comes from list_public_tables() (migration 158) rather than
// a hand-maintained list in code, so a table added by a future migration
// is included automatically, with nothing here to remember to update.
//
// Reachable only under /api/accounting — gated by both the staff PIN and
// the extra accounting password (see middleware.js), same as every other
// accounting-only page, since this is literally the entire database in
// one file.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import JSZip from 'jszip';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 1000;
// Fetches this many tables at once — fast enough to finish a clinic-sized
// backup well inside maxDuration, without opening so many concurrent
// requests that Supabase's own connection pool chokes on it.
const TABLE_CONCURRENCY = 5;

async function fetchAllRows(table) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('*')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function GET() {
  const { data: tableRows, error: tablesError } = await supabaseAdmin.rpc('list_public_tables');
  if (tablesError) {
    return NextResponse.json({ error: `Could not list tables: ${tablesError.message}` }, { status: 500 });
  }
  const tables = (tableRows || []).map((r) => r.table_name).sort();
  if (tables.length === 0) {
    return NextResponse.json({ error: 'No tables found to back up' }, { status: 500 });
  }

  const zip = new JSZip();
  const manifest = { exported_at: new Date().toISOString(), tables: {} };

  for (let i = 0; i < tables.length; i += TABLE_CONCURRENCY) {
    const batch = tables.slice(i, i + TABLE_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (table) => {
        const rows = await fetchAllRows(table);
        return { table, rows };
      })
    );
    for (const { table, rows } of results) {
      zip.file(`${table}.json`, JSON.stringify(rows, null, 2));
      manifest.tables[table] = rows.length;
    }
  }

  zip.file('_manifest.json', JSON.stringify(manifest, null, 2));
  zip.file(
    '_README.txt',
    'Europets full database backup.\n\n' +
      'One JSON file per database table (every row, exactly as stored). This does NOT include ' +
      'the actual photo/PDF/audio files from Storage (consult-files) — those stay in Supabase; only ' +
      'the records that reference them are here.\n\n' +
      'This file contains every client, patient, and financial record in the clinic. Store it ' +
      'somewhere secure (not a shared drive, not emailed) and delete old copies once a newer backup exists.\n'
  );

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const filename = `europets-backup-${new Date().toISOString().slice(0, 10)}.zip`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    },
  });
}
