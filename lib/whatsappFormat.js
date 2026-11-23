// lib/whatsappFormat.js
// WhatsApp's own formatting, not Markdown (concierge review 23 Nov): the AI
// sometimes writes **bold** or "### heading", which WhatsApp shows with the
// asterisks and hashes left in ("**Today, Friday 20 Nov**"). WhatsApp bolds
// with single asterisks, so those become *bold*. Wording is never changed.

export function forWhatsApp(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g, '*$1*')
    .replace(/__(?=\S)([^_\n]+?)(?<=\S)__/g, '_$1_')
    .replace(/^[ \t]*#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm, '*$1*');
}
