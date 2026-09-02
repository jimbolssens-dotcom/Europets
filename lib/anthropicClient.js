// lib/anthropicClient.js
// Server-side only — reads ANTHROPIC_API_KEY from the environment. Used to
// summarize consult/surgery transcripts into clinical note form.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';

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

const ConsultFieldsSchema = z.object({
  anamnesis: z
    .string()
    .nullable()
    .describe(
      'Client-reported history / presenting complaint — why the patient was brought in, onset, duration, relevant history. Null if not discussed in the transcript.'
    ),
  findings: z
    .string()
    .nullable()
    .describe(
      'Physical exam findings actually observed/stated (e.g. temperature, auscultation, palpation, visible abnormalities). Null if not discussed.'
    ),
  prognosis: z
    .string()
    .nullable()
    .describe('The prognosis as stated or implied by the vet. Null if not discussed.'),
  treatment_notes: z
    .string()
    .nullable()
    .describe(
      'The treatment plan — medications, procedures, follow-up, client instructions. Null if not discussed.'
    ),
});

// Breaks a recorded consult down into the same structured fields as the
// Vitals & Exam form (visits.anamnesis/findings/prognosis/treatment_notes),
// instead of one freeform note — so a recorded consult fills the record the
// same way a vet typing directly into those fields would.
export async function extractConsultFields(transcript) {
  const message = await anthropic.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 1536,
    system:
      'You are a veterinary scribe. You are given a raw speech-to-text transcript of a consult between a vet and a client (and possibly the animal in the background). Break it down into the structured fields of a consult record. Use plain clinical language, third person, no filler, no headings inside a field. Do not invent content that was not said — use null for any field genuinely not covered by the transcript.',
    messages: [{ role: 'user', content: transcript }],
    output_config: { format: zodOutputFormat(ConsultFieldsSchema) },
  });

  if (!message.parsed_output) {
    throw new Error('Could not break the recording down into structured fields — try again');
  }
  return message.parsed_output;
}

const FIELD_DESCRIPTIONS = {
  anamnesis: 'the Anamnesis field (client-reported history / presenting complaint) of a consult record',
  findings: 'the Findings field (physical exam findings) of a consult record',
  treatment_notes: 'the Treatment plan notes field of a consult record',
  surgical_notes: 'the Notes field of a surgical report',
  dental_notes: 'the Notes field of a dental report',
  hospitalization_notes: "the Notes field of a hospitalized patient's day-to-day worksheet entry",
};

// Short, single-field dictation: the vet clicks a mic button next to one
// field, dictates a sentence or two, and this turns the raw transcript into
// clean text for just that field — not a full structured note.
export async function summarizeField(transcript, kind) {
  const fieldDescription = FIELD_DESCRIPTIONS[kind] || 'a field in a patient record';

  const message = await anthropic.messages.create({
    model: 'claude-opus-5',
    max_tokens: 512,
    system: `You are a veterinary scribe. A vet has dictated the content for ${fieldDescription}. Turn the raw speech-to-text transcript below into clean text for that field: preserve all clinical content mentioned, but remove filler words, false starts, self-corrections, and any stray remarks not meant for the record. Write in third person, plain clinical language, no headings, no bullet points, no quotation marks. Do not add information that wasn't dictated. Return only the finished text.`,
    messages: [{ role: 'user', content: transcript }],
  });

  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

// Reads a photo of a UAE Emirates ID card and pulls out the name and ID
// number. Doesn't attempt to crop out the card's printed photo — the whole
// card image gets saved as a regular attachment on the client instead.
export async function extractEmiratesId(buffer, mediaType) {
  const message = await anthropic.messages.create({
    model: 'claude-opus-5',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') },
          },
          {
            type: 'text',
            text: 'This is a photo of a UAE Emirates ID card. Read the printed English text and extract the full name exactly as printed in English, and the ID Number (format 784-YYYY-NNNNNNN-N). Respond with ONLY raw JSON, no markdown fences, no commentary: {"full_name": string or null, "emirates_id": string or null}. Use null for anything not clearly legible — do not guess.',
          },
        ],
      },
    ],
  });

  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not read the ID card — try a clearer, well-lit photo');

  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error('Could not read the ID card — try a clearer, well-lit photo');
  }

  return { full_name: parsed.full_name || null, emirates_id: parsed.emirates_id || null };
}
