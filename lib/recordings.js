// lib/recordings.js
// Client-side helper for uploading a finished audio recording to the
// "consult-files" Storage bucket, then kicking off transcription +
// AI summarization via our own API.

import { supabase } from '@/lib/supabaseClient';

export async function uploadRecording({ entityType, entityId, blob, fileName }) {
  const name = fileName || `recording-${Date.now()}.webm`;
  const path = `recordings/${entityType}/${entityId}/${Date.now()}-${name}`;

  const { error: uploadError } = await supabase.storage
    .from('consult-files')
    .upload(path, blob, { contentType: blob.type || 'audio/webm' });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const res = await fetch('/api/recordings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entity_type: entityType,
      entity_id: entityId,
      file_path: path,
      file_name: name,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to start transcription');
  }
  return data;
}

export function recordingUrl(filePath) {
  const { data } = supabase.storage.from('consult-files').getPublicUrl(filePath);
  return data.publicUrl;
}
