// app/api/recordings/cleanup-audio/route.js
// POST /api/recordings/cleanup-audio -> one-time bulk cleanup for recordings
// that finished transcribing before resolveRecording started deleting audio
// automatically (see lib/recordingProcessing.js) — deletes each one's file
// from the consult-files Storage bucket and clears file_path. Idempotent:
// only ever touches "done" rows that still have a file_path set, so it's
// safe to call again (e.g. to pick up where a previous call left off).

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const BATCH_SIZE = 200;
const MAX_BATCHES = 25; // caps one call at 5000 recordings to stay inside maxDuration

export const maxDuration = 60;

export async function POST() {
  let deleted = 0;

  for (let batchNum = 0; batchNum < MAX_BATCHES; batchNum++) {
    const { data: batch, error: fetchError } = await supabase
      .from('recordings')
      .select('id, file_path')
      .eq('status', 'done')
      .not('file_path', 'is', null)
      .limit(BATCH_SIZE);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message, deleted }, { status: 500 });
    }
    if (!batch.length) {
      return NextResponse.json({ deleted, more: false });
    }

    const { error: removeError } = await supabase.storage
      .from('consult-files')
      .remove(batch.map((r) => r.file_path));
    if (removeError) {
      return NextResponse.json({ error: removeError.message, deleted }, { status: 500 });
    }

    const { error: updateError } = await supabase
      .from('recordings')
      .update({ file_path: null })
      .in('id', batch.map((r) => r.id));
    if (updateError) {
      // The files are already gone from Storage at this point — report what
      // happened rather than looping on rows we can no longer clear.
      return NextResponse.json({ error: updateError.message, deleted }, { status: 500 });
    }

    deleted += batch.length;
  }

  return NextResponse.json({ deleted, more: true });
}
