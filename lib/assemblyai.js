// lib/assemblyai.js
// Server-side only — thin wrapper over AssemblyAI's REST API. We submit the
// public Storage URL of an uploaded recording for transcription and have
// AssemblyAI call our webhook when it's done, rather than polling (avoids
// tying up a serverless function for the length of the recording).

const BASE_URL = 'https://api.assemblyai.com/v2';

function headers() {
  return {
    authorization: process.env.ASSEMBLYAI_API_KEY,
    'content-type': 'application/json',
  };
}

export async function submitTranscription({ audioUrl, webhookUrl }) {
  const res = await fetch(`${BASE_URL}/transcript`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      audio_url: audioUrl,
      webhook_url: webhookUrl,
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
