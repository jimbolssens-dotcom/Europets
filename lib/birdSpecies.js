// lib/birdSpecies.js
// Whether a patient's species is a bird. Species is free text ("Parrot",
// "African Grey", "bird "), so this matches on words. Used for the cattery's
// bird boarding rate (app/api/cattery/[id]/invoice: AED 50 a night instead
// of 60, Jim 4 Nov).

const BIRD_WORDS = [
  'bird', 'parrot', 'parakeet', 'macaw', 'grey', 'gray', 'cockatoo', 'cockatiel', 'budgie', 'budgerigar',
  'lovebird', 'canary', 'finch', 'conure', 'pigeon', 'dove', 'eclectus', 'lorikeet', 'lory', 'amazon',
  'owl', 'falcon', 'hawk', 'eagle', 'chicken', 'hen', 'rooster', 'duck', 'goose', 'quail', 'peacock', 'myna', 'mynah',
];

export function isBirdSpecies(species) {
  const words = String(species || '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return words.some((w) => BIRD_WORDS.includes(w) || w.endsWith('bird'));
}
