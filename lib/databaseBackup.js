// lib/databaseBackup.js
// Builds the full-database backup ZIP — shared by the manual download
// (app/api/accounting/database-backup) and the nightly automatic email
// (app/api/backups/nightly) so both stay behind the exact same export
// logic. One <table>.json per table plus a _manifest.json/_README.txt.
// Table list comes from list_public_tables() (migration 158) rather than
// a hand-maintained list, so a table added by a future migration is
// included automatically.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import JSZip from 'jszip';

const PAGE_SIZE = 1000;
// Fetches this many tables at once — fast enough to finish a clinic-sized
// backup well inside a serverless function's time limit, without opening
// so many concurrent requests that Supabase's own connection pool chokes
// on it.
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

// Returns { buffer, filename, manifest }. Throws on failure — callers
// decide how to report that (an HTTP error response for the manual
// download, a logged failure for the nightly job).
export async function buildDatabaseBackupZip() {
  const { data: tableRows, error: tablesError } = await supabaseAdmin.rpc('list_public_tables');
  if (tablesError) throw new Error(`Could not list tables: ${tablesError.message}`);
  const tables = (tableRows || []).map((r) => r.table_name).sort();
  if (tables.length === 0) throw new Error('No tables found to back up');

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
      'somewhere secure (not a shared drive, not emailed further) and delete old copies once a newer backup exists.\n'
  );

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const filename = `europets-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  return { buffer, filename, manifest };
}
