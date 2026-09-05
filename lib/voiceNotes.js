// lib/voiceNotes.js
// Client-side helper for a plain recorded voice note attached to an
// invoice line item (see migration 060) — uploaded straight to Storage,
// no transcription/AI pipeline, unlike lib/recordings.js.

import { supabase } from '@/lib/supabaseClient';

export async function uploadVoiceNote({ lineItemId, blob }) {
  const path = `dispensing-voice-notes/${lineItemId}/${Date.now()}.webm`;

  const { error } = await supabase.storage
    .from('consult-files')
    .upload(path, blob, { contentType: blob.type || 'audio/webm' });

  if (error) {
    throw new Error(error.message);
  }
  return path;
}

export function voiceNoteUrl(path) {
  const { data } = supabase.storage.from('consult-files').getPublicUrl(path);
  return data.publicUrl;
}
