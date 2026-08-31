// lib/anthropicClient.js
// Server-side only — reads ANTHROPIC_API_KEY from the environment. Used to
// summarize consult/surgery transcripts into clinical note form.

import Anthropic from '@anthropic-ai/sdk';

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CONSULT_SYSTEM_PROMPT = `You are a veterinary scribe. You are given a raw speech-to-text transcript of a consult between a vet and a client (and possibly the animal in the background). Turn it into a concise clinical note a vet would write in a patient record.

Structure it with short headings only where relevant to what was actually said (skip any that don't apply): Chief complaint, History, Findings, Assessment, Plan. Use plain clinical language, third person, no filler. Do not invent findings that weren't mentioned. If the transcript is mostly small talk with little clinical content, say so briefly rather than padding it out.`;

const SURGERY_SYSTEM_PROMPT = `You are a veterinary scribe. You are given a raw speech-to-text transcript of a surgeon narrating during or after a procedure. Turn it into a concise surgical note.

Structure it with short headings only where relevant to what was actually said (skip any that don't apply): Procedure, Findings, Technique, Complications, Post-op plan. Use plain clinical language, third person, no filler. Do not invent details that weren't mentioned.`;

export async function summarizeTranscript(transcript, kind) {
  const system = kind === 'surgical_report' ? SURGERY_SYSTEM_PROMPT : CONSULT_SYSTEM_PROMPT;

  const message = await anthropic.messages.create({
    model: 'claude-opus-5',
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: transcript }],
  });

  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}
