// lib/assemblyai.js
// Server-side only — thin wrapper over AssemblyAI's REST API.
//
// Two usage patterns in this app:
//  - Full consult/surgery recordings: submit the public Storage URL with a
//    webhook_url and let AssemblyAI call us back (avoids tying up a
//    serverless function for the length of the recording).
//  - Short per-field dictations (a few seconds to ~a minute): upload the
//    clip directly, submit it with no webhook, and poll for completion
//    within the one request — short enough to not need async handling.

const BASE_URL = 'https://api.assemblyai.com/v2';

function headers(extra) {
  return {
    authorization: process.env.ASSEMBLYAI_API_KEY,
    ...extra,
  };
}

export async function uploadAudio(buffer) {
  const res = await fetch(`${BASE_URL}/upload`, {
    method: 'POST',
    headers: headers({ 'content-type': 'application/octet-stream' }),
    body: buffer,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to upload audio');
  }
  return data.upload_url;
}

export async function submitTranscription({ audioUrl, webhookUrl }) {
  const res = await fetch(`${BASE_URL}/transcript`, {
    method: 'POST',
    headers: headers({ 'content-type': 'application/json' }),
    body: JSON.stringify({
      audio_url: audioUrl,
      webhook_url: webhookUrl || undefined,
      speaker_labels: true,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to submit transcription job');
  }
  return data; // { id, status, ... }
}

export async function getTranscript(transcriptId) {
  const res = await fetch(`${BASE_URL}/transcript/${transcriptId}`, {
    headers: headers(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch transcript');
  }
  return data; // { id, status, text, utterances, error, ... }
}

export async function pollTranscript(transcriptId, { intervalMs = 1500, timeoutMs = 55000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await getTranscript(transcriptId);
    if (job.status === 'completed' || job.status === 'error') {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Transcription timed out — try a shorter recording');
}
