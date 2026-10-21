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

// A WhatsApp voice note (migration 196): a few seconds to a couple of
// minutes, any language a client speaks (language detection on, no
// speaker labels). Returns the text, or null if there was no speech or it
// failed, in which case the voice note simply goes to staff as before.
export async function transcribeVoiceNote(audioUrl, { timeoutMs = 40000 } = {}) {
  if (!process.env.ASSEMBLYAI_API_KEY) return null;
  try {
    const res = await fetch(`${BASE_URL}/transcript`, {
      method: 'POST',
      headers: headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ audio_url: audioUrl, language_detection: true }),
    });
    const job = await res.json();
    if (!res.ok) throw new Error(job.error || 'Failed to submit voice note');
    const finished = await pollTranscript(job.id, { intervalMs: 1000, timeoutMs });
    if (finished.status !== 'completed') return null;
    const text = (finished.text || '').trim();
    return text || null;
  } catch (err) {
    console.error('Voice note transcription failed', err);
    return null;
  }
}

// What's said in a short clip's sound (a Social Reel's subtitles,
// lib/socialSubtitlesPlan.js): the words with when each is said, in seconds.
// Any language (detection on, falling back to English when the clip is too
// short for it to tell). An empty list when nothing is said.
export async function transcribeWords(buffer, { timeoutMs = 40000 } = {}) {
  const audioUrl = await uploadAudio(buffer);
  const run = async (options) => {
    const res = await fetch(`${BASE_URL}/transcript`, {
      method: 'POST',
      headers: headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ audio_url: audioUrl, ...options }),
    });
    const job = await res.json();
    if (!res.ok) throw new Error(job.error || 'Failed to submit the clip for subtitles');
    return pollTranscript(job.id, { intervalMs: 1000, timeoutMs });
  };
  let finished = await run({ language_detection: true });
  if (finished.status === 'error' && /language/i.test(finished.error || '')) finished = await run({ language_code: 'en' });
  if (finished.status === 'error') {
    if (/no spoken audio|does not appear to contain audio/i.test(finished.error || '')) return [];
    throw new Error(finished.error || 'Transcription failed');
  }
  return (finished.words || []).map((x) => ({ w: x.text, s: x.start / 1000, e: x.end / 1000 }));
}
