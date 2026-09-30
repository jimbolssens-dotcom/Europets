// app/api/backups/nightly/route.js
// GET -> builds the full database backup (see lib/databaseBackup.js) and
// emails it, once a night, to whoever's listed in BACKUP_NOTIFICATION_EMAIL
// (comma-separated for more than one address). Triggered by Vercel Cron
// (see vercel.json), which signs its own requests with a Bearer token
// matching the CRON_SECRET project env var — anyone else calling this
// without it gets a 401. Same pattern as
// app/api/intake-requests/cleanup-stale.
//
// Deliberately NOT under /api/accounting — that whole path requires the
// extra accounting-password cookie (see middleware.js) on top of the
// staff PIN, which a cron job has no way to carry. This route instead
// only needs the general staff gate bypassed (see PUBLIC_PATTERNS in
// middleware.js) and checks CRON_SECRET itself, exactly like the other
// two cron routes.
//
// If the ZIP is small enough, it's attached directly to the email — kept
// independent of Supabase entirely, which is the whole point of this
// backup existing. Only once it grows past ATTACHMENT_LIMIT_MB (which,
// at this clinic's current size, is nowhere close) does it instead upload
// to the private "database-backups" Storage bucket (migration 159) and
// email a time-limited signed link — still automatic, just one click
// away from being independent rather than already in hand.

import { buildDatabaseBackupZip } from '@/lib/databaseBackup';
import { sendEmail } from '@/lib/email';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Comfortably under every major mailbox provider's own inbound limit
// (most cap somewhere around 20-25MB for the whole message, attachment
// included) — leaves headroom for base64 encoding adding ~33% on top of
// the raw file size.
const ATTACHMENT_LIMIT_MB = 15;
// How long the fallback signed link stays valid — long enough to not be
// annoying, short enough that a backup link isn't quietly reachable
// forever if it ever leaked.
const SIGNED_URL_DAYS = 7;

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const to = (process.env.BACKUP_NOTIFICATION_EMAIL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (to.length === 0) {
    return NextResponse.json({ error: 'BACKUP_NOTIFICATION_EMAIL is not set' }, { status: 500 });
  }

  let buffer, filename, manifest;
  try {
    ({ buffer, filename, manifest } = await buildDatabaseBackupZip());
  } catch (err) {
    return NextResponse.json({ error: `Failed to build backup: ${err.message}` }, { status: 500 });
  }

  const sizeMb = buffer.length / (1024 * 1024);
  const tableCount = Object.keys(manifest.tables).length;
  const rowCount = Object.values(manifest.tables).reduce((sum, n) => sum + n, 0);
  const summaryLine = `${tableCount} tables, ${rowCount} rows, ${sizeMb.toFixed(1)} MB.`;

  try {
    if (sizeMb <= ATTACHMENT_LIMIT_MB) {
      await sendEmail({
        to,
        subject: `Europets database backup — ${new Date().toISOString().slice(0, 10)}`,
        text: `Attached: tonight's full database backup.\n\n${summaryLine}\n\nSave it somewhere secure — this is the clinic's complete client and financial data.`,
        attachments: [{ filename, content: buffer.toString('base64') }],
      });
      return NextResponse.json({ ok: true, delivery: 'attachment', ...manifest, sizeMb });
    }

    const path = `backups/${filename}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('database-backups')
      .upload(path, buffer, { contentType: 'application/zip', upsert: true });
    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from('database-backups')
      .createSignedUrl(path, SIGNED_URL_DAYS * 24 * 60 * 60);
    if (signError) throw new Error(`Could not create a download link: ${signError.message}`);

    await sendEmail({
      to,
      subject: `Europets database backup — ${new Date().toISOString().slice(0, 10)}`,
      text: `Tonight's backup grew too large to attach directly (${summaryLine}), so here's a download link instead — valid for ${SIGNED_URL_DAYS} days:\n\n${signed.signedUrl}\n\nDownload and save it somewhere secure — this is the clinic's complete client and financial data.`,
    });
    return NextResponse.json({ ok: true, delivery: 'link', ...manifest, sizeMb });
  } catch (err) {
    console.error('Nightly database backup email failed', err);
    return NextResponse.json({ error: err.message, ...manifest, sizeMb }, { status: 502 });
  }
}
