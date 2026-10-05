// lib/noDashes.js
// The clinic never wants a long dash (— or –) in anything sent to a
// client: it reads as a dead giveaway of AI-written text. Every outbound
// path runs its text through withoutDashes — free-text WhatsApp sends,
// template parameters, emails, and the AI concierge/sweep replies before
// they're logged — so it can't slip through from a model reply, a staff
// paste, or a hard-coded notice. The AI prompts are also told not to use
// them, so this is a safety net rather than the main fix.
//
// A dash between two numbers ("8:00–10:00", "1000–2000") becomes a plain
// hyphen; anywhere else it becomes a comma (", "), which reads naturally
// in almost every place a dash is used mid-sentence.

export function withoutDashes(text) {
  if (typeof text !== 'string' || !/[—–]/.test(text)) return text;
  return text
    .replace(/(\d)\s*[—–]\s*(\d)/g, '$1-$2')
    .replace(/[ \t]*[—–]+[ \t]*/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*([.!?;:])/g, '$1')
    .replace(/([.!?;:])\s*,\s*/g, '$1 ')
    .replace(/^\s*,\s*/gm, '')
    .replace(/,[ \t]*$/gm, '');
}
