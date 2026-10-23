// lib/dictationPrompt.js
// The words for AI dictation in Messages (lib/dictation.js): staff speak
// their reply, it's transcribed, and the AI turns it into a message ready
// to review and send. Pure, so it can be tested (tests/dictation.test.mjs).

export const DICTATION_SYSTEM = `You turn a vet clinic staff member's spoken reply into the WhatsApp message they meant to send to a client of Europets Clinic, a small veterinary clinic in Sharjah.

Rules:
- Keep every fact they said: names, times, prices, doses, instructions. Never add facts, promises, prices or medical advice they didn't say.
- Fix what speech gets wrong: filler words, false starts, repeats, "full stop", spoken punctuation, words the transcription misheard (use the conversation for names and context).
- Write it the way they'd send it: warm, short, plain English, first person as the clinic team. Use the client's first name once if it fits. No long dashes. No sign-off name.
- If they spoke another language, write the message in that language.
- If they were clearly talking to a colleague rather than dictating (e.g. "tell her that..."), write the message to the client that they meant.
- Reply with the message only.`;

export function buildDictationText({ transcript, clientName, recent = [] }) {
  const lines = [];
  if (clientName) lines.push(`The client: ${clientName}.`);
  if (recent.length) {
    lines.push('The last messages in the conversation (oldest first), for context only:');
    for (const m of recent) lines.push(`${m.sender === 'client' ? 'Client' : 'Clinic'}: ${String(m.body || '').replace(/\s+/g, ' ').slice(0, 400)}`);
  }
  lines.push('', `What the staff member said: ${transcript}`);
  return lines.join('\n');
}
