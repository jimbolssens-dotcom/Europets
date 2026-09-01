// lib/species.js
// Loose species classification for filtering vaccine protocols. Patient
// species is a free-text field (e.g. "Dog", "cat", "Feline", "Puppy"), not
// an enum, so this matches by keyword rather than an exact value.

export function classifySpecies(rawSpecies) {
  const s = (rawSpecies || '').trim().toLowerCase();
  if (/cat|feline|kitten/.test(s)) return 'cat';
  if (/dog|canine|puppy/.test(s)) return 'dog';
  return null;
}
