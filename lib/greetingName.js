// lib/greetingName.js
// The name a client is greeted by in a WhatsApp or email ("Hi Shkha
// Ghada"), not their full registered name ("Hi Shkha Ghada Ahmed Al
// Qassimi" read stiff and formal). The first name, keeping a title in
// front of it (Sheikha, Dr, ...) so it stays respectful. Anything in
// brackets ("Aileen Alnuaimi (aileen Diaz)") is dropped.

const TITLES = new Set([
  'sheikh', 'shaikh', 'sheikha', 'shaikha', 'shekha', 'shkha', 'shk', 'sh',
  'dr', 'mr', 'mrs', 'ms', 'miss', 'he', 'h.e', 'h.e.',
]);

function tidy(word) {
  return word && word === word.toLowerCase() ? word[0].toUpperCase() + word.slice(1) : word;
}

export function greetingName(fullName, fallback = 'there') {
  const words = String(fullName || '')
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return fallback;
  const first = words[0];
  if (TITLES.has(first.toLowerCase().replace(/\.$/, '')) && words[1]) {
    return `${tidy(first)} ${tidy(words[1])}`;
  }
  return tidy(first);
}
