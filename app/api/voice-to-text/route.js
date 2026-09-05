// app/api/voice-to-text/route.js
// POST /api/voice-to-text  -> dictate a single form field. Takes a short
// audio clip (FormData: `audio`, `kind`), transcribes it with AssemblyAI,
// summarizes it into clean field text with Claude, and returns { text }.
// Synchronous (unlike the full-recording flow) since these clips are short
// — no Storage, no DB row, nothing persisted; it's a one-shot dictation aid.

import { uploadAudio, submitTranscription, pollTranscript } from '@/lib/assemblyai';
import { summarizeField } from '@/lib/anthropicClient';
import { NextResponse } from 'next/server';

export const maxDuration = 60;

const VALID_KINDS = [
  'anamnesis',
  'findings',
  'treatment_notes',
  'surgical_notes',
  'dental_notes',
  'hospitalization_notes',
  'treatment_item_instructions',
];

export async function POST(request) {
  const formData = await request.formData();
  const audio = formData.get('audio');
  const kind = formData.get('kind');

  if (!audio || typeof audio === 'string') {
    return NextResponse.json({ error: 'audio file is required' }, { status: 400 });
  }
  if (!VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: 'invalid kind' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await audio.arrayBuffer());
    const uploadUrl = await uploadAudio(buffer);
    const job = await submitTranscription({ audioUrl: uploadUrl });
    const finished = await pollTranscript(job.id);

    if (finished.status === 'error') {
      return NextResponse.json({ error: finished.error || 'Transcription failed' }, { status: 502 });
    }

    const transcript = (finished.text || '').trim();
    if (!transcript) {
      return NextResponse.json({ error: 'No speech detected' }, { status: 422 });
    }

    const text = await summarizeField(transcript, kind);
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
