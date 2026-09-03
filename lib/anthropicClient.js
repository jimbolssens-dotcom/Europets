// lib/anthropicClient.js
// Server-side only — reads ANTHROPIC_API_KEY from the environment. Used to
// summarize consult/surgery transcripts into clinical note form.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CONSULT_SYSTEM_PROMPT = `You are a veterinary scribe. You are given a raw speech-to-text transcript of a consult between a vet and a client (and possibly the animal in the background). Turn it into a concise clinical note a vet would write in a patient record.

Structure it with short headings only where relevant to what was actually said (skip any that don't apply): Chief complaint, History, Findings, Assessment, Plan. Use plain clinical language, third person, no filler. Do not invent findings that weren't mentioned. If the transcript is mostly small talk with little clinical content, say so briefly rather than padding it out.`;

const HOSPITALIZATION_SYSTEM_PROMPT = `You are a veterinary scribe. You are given a raw speech-to-text transcript of a staff member dictating a day-to-day observation of a hospitalized/admitted patient. Turn it into a concise worksheet note.

Structure it with short headings only where relevant to what was actually said (skip any that don't apply): Appetite, Weight, Temperature, Condition, Medications/treatments given, Notes. Use plain clinical language, third person, no filler. Do not invent findings that weren't mentioned.`;

export async function summarizeTranscript(transcript, kind, extraContext) {
  let system = kind === 'hospitalization' ? HOSPITALIZATION_SYSTEM_PROMPT : CONSULT_SYSTEM_PROMPT;

  if (extraContext) {
    system += `\n\n${extraContext}`;
  }

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
  weight_kg: z
    .number()
    .nullable()
    .describe('The patient\'s weight in kilograms, if measured/stated (convert from other units if needed). Null if not mentioned.'),
  temperature_c: z
    .number()
    .nullable()
    .describe('The patient\'s temperature in Celsius, if measured/stated (convert from Fahrenheit if needed). Null if not mentioned.'),
  body_condition_score: z
    .number()
    .int()
    .nullable()
    .describe('Body condition score on a 1-9 scale, if assessed/stated. Null if not mentioned.'),
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
      'Physical exam findings actually observed/stated — auscultation, palpation, mucous membranes, hydration, visible abnormalities, etc. Do NOT include weight, temperature, or body condition score here — those have their own fields above. Null if not discussed.'
    ),
  diagnosis: z
    .string()
    .nullable()
    .describe('The diagnosis or clinical assessment as stated or implied by the vet. Null if not discussed.'),
  prognosis: z
    .string()
    .nullable()
    .describe('The prognosis as stated or implied by the vet. Null if not discussed.'),
  treatment_notes: z
    .string()
    .nullable()
    .describe(
      'The treatment plan in narrative form — medications, procedures, follow-up, client instructions. Null if not discussed.'
    ),
  diagnostics_ordered: z
    .array(z.string())
    .describe(
      'Diagnostic tests actually ordered or run during this consult. If a test matches one of the catalog items listed in the system prompt, use that item\'s name EXACTLY as printed there (same spelling, wording, capitalization) — do not paraphrase it. If a test was run but does not match any catalog item, omit it rather than inventing a name. Only include tests actually ordered/run, not ones merely discussed as an option. Empty array if none.'
    ),
  treatments_given: z
    .array(
      z.object({
        name: z
          .string()
          .describe(
            'Name of the medication, product, or service. If it matches one of the catalog items listed in the system prompt, use that item\'s name EXACTLY as printed there (same spelling, wording, capitalization) — do not paraphrase it. If it does not match any catalog item, omit this entry rather than inventing a name.'
          ),
        instructions: z
          .string()
          .nullable()
          .describe('Dosage, frequency, or duration if mentioned. Null otherwise.'),
        quantity: z.number().nullable().describe('Quantity/amount if mentioned. Null otherwise.'),
      })
    )
    .describe(
      'Medications, products, or services actually administered or prescribed during this consult — not ones merely discussed as an option. Empty array if none.'
    ),
});

// Breaks a recorded consult down into the same structured fields as the
// Vitals & Exam form (weight/temperature/BCS/anamnesis/findings/diagnosis/
// prognosis/treatment_notes), instead of one freeform note, plus the
// diagnostic tests and treatments actually given. `catalogContext` — the
// clinic's actual test and product/service catalog item names — is baked
// into the prompt so the model names diagnostics/treatments using the
// catalog's own spelling instead of a paraphrase a fuzzy string match
// would miss (e.g. "Anaemia PCR panel" vs. the catalog's "PCR Anemia
// panel"); the webhook that calls this then looks those exact names up
// directly.
export async function extractConsultFields(transcript, catalogContext = {}) {
  const { testNames = [], productServiceNames = [] } = catalogContext;

  const catalogSection = `

Diagnostic test catalog — when a test corresponds to one of these, copy its name exactly (spelling, wording, capitalization) into diagnostics_ordered: ${testNames.length ? testNames.join(', ') : '(no test catalog items available)'}

Medication/product/service catalog — when a treatment corresponds to one of these, copy its name exactly (spelling, wording, capitalization) into treatments_given[].name: ${productServiceNames.length ? productServiceNames.join(', ') : '(no product/service catalog items available)'}`;

  const message = await anthropic.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 1536,
    system:
      'You are a veterinary scribe. You are given a raw speech-to-text transcript of a consult between a vet and a client (and possibly the animal in the background). Break it down into the structured fields of a consult record. Use plain clinical language, third person, no filler, no headings inside a field. Do not invent content that was not said — use null (or an empty array) for anything genuinely not covered by the transcript.' +
      catalogSection,
    messages: [{ role: 'user', content: transcript }],
    output_config: { format: zodOutputFormat(ConsultFieldsSchema) },
  });

  if (!message.parsed_output) {
    throw new Error('Could not break the recording down into structured fields — try again');
  }
  return message.parsed_output;
}

const HospitalizationNoteFieldsSchema = z.object({
  appetite: z
    .enum(['good', 'reduced', 'none'])
    .nullable()
    .describe('The patient\'s appetite as assessed/stated. Null if not mentioned.'),
  weight_kg: z
    .number()
    .nullable()
    .describe('The patient\'s weight in kilograms, if measured/stated (convert from other units if needed). Null if not mentioned.'),
  temperature_c: z
    .number()
    .nullable()
    .describe('The patient\'s temperature in Celsius, if measured/stated (convert from Fahrenheit if needed). Null if not mentioned.'),
  condition: z
    .string()
    .nullable()
    .describe('A short (few words to one sentence) general condition summary, e.g. "bright, alert, responsive" or "lethargic, still guarding abdomen". Null if not discussed.'),
  notes: z
    .string()
    .nullable()
    .describe(
      'Any other observations worth recording — behavior, wound/bandage checks, urination/defecation, owner visit, anything not covered by appetite/weight/temperature/condition above. Null if not discussed.'
    ),
  items_given: z
    .array(
      z.object({
        name: z
          .string()
          .describe(
            'Name of the medication, test, or other catalog item performed/given during this observation. If it matches one of the catalog items listed in the system prompt, use that item\'s name EXACTLY as printed there (same spelling, wording, capitalization) — do not paraphrase it. If it does not match any catalog item, omit this entry rather than inventing a name.'
          ),
        instructions: z
          .string()
          .nullable()
          .describe('Dosage, frequency, or duration if mentioned. Null otherwise.'),
        quantity: z.number().nullable().describe('Quantity/amount if mentioned. Null otherwise.'),
      })
    )
    .describe(
      'Medications, tests, or other catalog items actually given/performed as part of this observation — not ones merely discussed as an option. Empty array if none.'
    ),
});

// Breaks a recorded hospitalization worksheet observation down into the
// same fields as the "Add Worksheet Entry" form (appetite/weight_kg/
// temperature_c/condition/notes), plus any medications/tests actually
// given. Unlike a consult, the worksheet entry doesn't exist as a row
// yet at recording time — this returns the extraction directly (the
// webhook stores it on the recording itself) rather than writing to a
// hospitalization_notes row; the page reads it back into that still-
// unsaved draft form. `catalogNames` is baked into the prompt the same
// way as extractConsultFields, so items are named using the catalog's
// own spelling instead of a paraphrase a fuzzy match would miss.
export async function extractHospitalizationNoteFields(transcript, catalogNames = []) {
  const catalogSection = `

Medication/test/service catalog — when an item given corresponds to one of these, copy its name exactly (spelling, wording, capitalization) into items_given[].name: ${catalogNames.length ? catalogNames.join(', ') : '(no catalog items available)'}`;

  const message = await anthropic.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 1024,
    system:
      'You are a veterinary scribe. You are given a raw speech-to-text transcript of a staff member dictating a day-to-day observation of a hospitalized/admitted patient. Break it down into the structured fields of a worksheet entry. Use plain clinical language, third person, no filler, no headings inside a field. Do not invent content that was not said — use null (or an empty array) for anything genuinely not covered by the transcript.' +
      catalogSection,
    messages: [{ role: 'user', content: transcript }],
    output_config: { format: zodOutputFormat(HospitalizationNoteFieldsSchema) },
  });

  if (!message.parsed_output) {
    throw new Error('Could not break the recording down into structured fields — try again');
  }
  return message.parsed_output;
}

const FIELD_DESCRIPTIONS = {
  anamnesis: 'the Anamnesis field (client-reported history / presenting complaint) of a consult record',
  findings: 'the Findings field (physical exam findings) of a consult record',
  diagnosis: 'the Diagnosis field of a consult record',
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

const POSTOP_PROCEDURE_LABELS = {
  surgical: 'surgical procedure',
  dental: 'dental procedure',
};

// Drafts the ONE report a dental/surgical dictation produces: what was
// done today, in plain language, followed by home-care instructions —
// meant to go to the owner as-is (no separate clinical note + separate
// on-demand post-op draft). The clinic's standard baseline (edited/
// approved on the Settings page) is the standard of care for the
// home-care half, adapted to whatever this transcript (and, for dental,
// the chart) actually says. Called right after transcription (see the
// recordings webhook) — the vet can still edit the saved result before
// it's shared, but there's no separate "generate" step to run first.
export async function generateClientReport({ procedureType, transcript, patientName, species, baseline, dentalChartContext }) {
  const procedureLabel = POSTOP_PROCEDURE_LABELS[procedureType] || 'procedure';

  const baselineSection = baseline?.trim()
    ? `The clinic's standard home-care instructions for a ${procedureLabel} are:\n"""\n${baseline.trim()}\n"""\nUse these as the starting point and standard of care for the home-care part of the report — keep everything that still applies, and only depart from them where the transcript below gives a clear reason to (e.g. an extra medication given, a complication, a precaution the vet mentioned).`
    : `The clinic has no standard baseline home-care instructions on file for a ${procedureLabel} yet — draft sensible, conservative general home-care instructions appropriate for this kind of procedure in a companion animal.`;

  const parts = [
    `Patient: ${patientName || 'the patient'} (${species || 'unknown species'})`,
    baselineSection,
    dentalChartContext || null,
    `Transcript of the vet's dictation:\n"""\n${transcript.trim()}\n"""`,
  ].filter(Boolean);

  const dentalChartNote =
    procedureType === 'dental'
      ? ' If a dental chart note is given below, treat it as the source of truth for which teeth are extracted or already missing, and name every extracted tooth (by its label, e.g. "P4 (upper right)") under what was done today even if the vet didn\'t call out every tooth by number in the recording.'
      : '';

  const message = await anthropic.messages.create({
    model: 'claude-opus-5',
    max_tokens: 1536,
    system: `You are a veterinary assistant writing the ONE report a pet owner receives after their pet's ${procedureLabel}. Write directly to the owner, second person ("your pet" / the pet's name), warm but clear plain language — no clinical jargon, no markdown "#" headings. This single report has two jobs: (1) tell the owner what was done today, based only on the dictation transcript below — don't invent findings; (2) give them the home-care instructions for after this procedure, based on the clinic's baseline below. Structure it with short, clear section headings covering both halves (e.g. "What We Did Today", then home-care sections like Activity/Wound or Mouth Care/Feeding/Medications/When to Call Us) — skip any that don't apply.${dentalChartNote} Keep it concise enough for a worried owner to read and understand in one pass. Return only the finished report, nothing else.`,
    messages: [{ role: 'user', content: parts.join('\n\n') }],
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

const EXPENSE_CATEGORIES = [
  'supplies',
  'rent',
  'utilities',
  'salaries',
  'equipment',
  'marketing',
  'professional_fees',
  'other',
];

// Reads a photo of a supplier invoice/receipt and pulls out the fields
// needed to log it as an expense — vendor, date, the pre-VAT amount, and
// the VAT charged (so input VAT can be reclaimed against output VAT on
// the accounting overview). The photo itself is saved separately as a
// regular attachment (entity_type 'expense'), same as every other
// photo/file in the app — this only reads it.
export async function extractExpenseReceipt(buffer, mediaType) {
  const message = await anthropic.messages.create({
    model: 'claude-opus-5',
    max_tokens: 400,
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
            text: `This is a photo of a supplier invoice or receipt for a UAE veterinary clinic's own purchase (not a client invoice). Extract:
- vendor_name: the supplier/merchant's name
- expense_date: the invoice/receipt date, as YYYY-MM-DD
- amount: the pre-VAT (net/subtotal) amount as a plain number
- vat_amount: the VAT charged as a plain number (5% UAE VAT if not itemized separately — compute it from the total if only a VAT-inclusive total is shown and no explicit VAT line exists)
- category: your best guess, one of ${EXPENSE_CATEGORIES.join(', ')}

Respond with ONLY raw JSON, no markdown fences, no commentary: {"vendor_name": string or null, "expense_date": string or null, "amount": number or null, "vat_amount": number or null, "category": string or null}. Use null for anything not clearly legible or determinable — do not guess wildly.`,
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
  if (!match) throw new Error('Could not read the receipt — try a clearer, well-lit photo');

  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error('Could not read the receipt — try a clearer, well-lit photo');
  }

  return {
    vendor_name: parsed.vendor_name || null,
    expense_date: parsed.expense_date || null,
    amount: typeof parsed.amount === 'number' ? parsed.amount : null,
    vat_amount: typeof parsed.vat_amount === 'number' ? parsed.vat_amount : null,
    category: EXPENSE_CATEGORIES.includes(parsed.category) ? parsed.category : null,
  };
}
