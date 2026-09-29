// app/api/accounting/database-backup/route.js
// GET -> a full backup of every table in the database (every client,
// patient, appointment, invoice, treatment record, ...), as a downloadable
// ZIP: one <table>.json per table plus a _manifest.json listing export
// time and row counts. Meant as an independent, offline copy for disaster
// recovery — a Supabase-side incident, an accidental mass-delete, a
// billing lapse — not a live failover (a real always-in-sync local
// instance would need its own database and a safe conflict-resolution
// story, which this deliberately isn't).
//
// The actual export logic lives in lib/databaseBackup.js, shared with the
// nightly automatic email (app/api/backups/nightly) so both stay behind
// the exact same table list and export shape.
//
// Reachable only under /api/accounting — gated by both the staff PIN and
// the extra accounting password (see middleware.js), same as every other
// accounting-only page, since this is literally the entire database in
// one file.

import { buildDatabaseBackupZip } from '@/lib/databaseBackup';
import { NextResponse } from 'next/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET() {
  let buffer, filename;
  try {
    ({ buffer, filename } = await buildDatabaseBackupZip());
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    },
  });
}
