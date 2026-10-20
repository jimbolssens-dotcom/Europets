// lib/recordings.js
// Client-side helper for uploading a finished audio recording to the
// "consult-files" Storage bucket, then kicking off transcription +
// AI summarization via our own API. The upload is tried a few times
// (lib/storageUpload.js); if it still fails, the recorder keeps the audio
// so it can be sent again or saved (app/_components/AudioRecorder.jsx).

import { supabase } from '@/lib/supabaseClient';
import { uploadWithRetry } from '@/lib/storageUpload';

function extensionFor(mimeType) {
  const type = (mimeType || '').split(';')[0].trim();
  const known = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg' };
  return known[type] || 'webm';
}

// `sent` remembers how far a try got, so trying again after a failure
// doesn't upload the same audio twice: { path, name } once the file is up.
export async function uploadRecording({ entityType, entityId, blob, fileName, sent = {} }) {
  if (!sent.path) {
    const name = fileName || `recording-${Date.now()}.${extensionFor(blob.type)}`;
    const path = `recordings/${entityType}/${entityId}/${Date.now()}-${name}`;
    try {
      await uploadWithRetry('consult-files', path, blob, blob.type || 'audio/webm');
    } catch (err) {
      throw new Error(`Didn't upload (${err.message || 'connection dropped'}).`);
    }
    sent.path = path;
    sent.name = name;
  }
  const { path, name } = sent;

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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Failed to start transcription');
    // 502: the recording is saved and shows as Failed with its own Retry.
    err.saved = res.status === 502;
    throw err;
  }
  return data;
}

export function recordingUrl(filePath) {
  const { data } = supabase.storage.from('consult-files').getPublicUrl(filePath);
  return data.publicUrl;
}
