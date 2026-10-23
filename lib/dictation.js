// lib/dictation.js
// AI dictation for Messages (app/_components/DictateButton.jsx): the
// recording (uploaded to storage by the browser) is transcribed
// (lib/assemblyai.js), then the AI writes it as the reply they meant, with
// the conversation for context (lib/dictationPrompt.js). Staff review and
// send it themselves; nothing is sent from here.

import { anthropic } from '@/lib/anthropicClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { transcribeVoiceNote } from '@/lib/assemblyai';
import { withoutDashes } from '@/lib/noDashes';
import { DICTATION_SYSTEM, buildDictationText } from '@/lib/dictationPrompt';

const MODEL = 'claude-opus-5';

export async function dictateReply({ audioUrl, clientId }) {
  const transcript = await transcribeVoiceNote(audioUrl, { timeoutMs: 45000 });
  if (!transcript) return { error: "Couldn't hear anything in that. Try again a little closer to the phone.", status: 422 };

  let clientName = null;
  let recent = [];
  if (clientId) {
    const [{ data: client }, { data: msgs }] = await Promise.all([
      supabaseAdmin.from('clients').select('full_name').eq('id', clientId).maybeSingle(),
      supabaseAdmin.from('client_messages').select('sender, body, created_at').eq('client_id', clientId).not('body', 'is', null).order('created_at', { ascending: false }).limit(8),
    ]);
    clientName = client?.full_name || null;
    recent = (msgs || []).reverse();
  }

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: DICTATION_SYSTEM,
      messages: [{ role: 'user', content: buildDictationText({ transcript, clientName, recent }) }],
    });
    const draft = withoutDashes((message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim());
    return { transcript, draft: draft || transcript };
  } catch (err) {
    // The words are still useful without the tidy-up.
    return { transcript, draft: transcript, note: `The AI couldn't tidy it (${err.message}), so here are your exact words.` };
  }
}
