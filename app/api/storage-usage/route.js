// app/api/storage-usage/route.js
// GET -> how much of the Supabase plan's file storage and database space
// the clinic is using (see migration 173's storage_usage), plus the
// plan allowances it's measured against, for the Storage page.
// Staff-only: not in middleware.js's public patterns.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Included in the Supabase Pro plan (before any paid overage). Override
// with env vars if the plan changes.
const GB = 1024 ** 3;
const FILES_LIMIT_BYTES = Number(process.env.SUPABASE_FILES_LIMIT_GB || 100) * GB;
const DATABASE_LIMIT_BYTES = Number(process.env.SUPABASE_DATABASE_LIMIT_GB || 8) * GB;

export async function GET() {
  const { data, error } = await supabaseAdmin.rpc('storage_usage');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    ...data,
    files_limit_bytes: FILES_LIMIT_BYTES,
    database_limit_bytes: DATABASE_LIMIT_BYTES,
  });
}
