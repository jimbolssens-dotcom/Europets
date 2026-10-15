// lib/smallPet.js
// Small pets and exotics (rabbits, guinea pigs, hamsters, chinchillas,
// ferrets, birds, reptiles...): anything that isn't a cat or a dog, bar
// the occasional large animal. These are the patients whose consent forms
// carry the handling risk section (lib/consentTemplates.js): stress from
// handling alone can kill them. Species is free text, so it's normalised
// ("Hamster " with a trailing space is a real value).

const NOT_SMALL = new Set([
  '', 'unknown', 'cat', 'dog', 'feline', 'canine', 'kitten', 'puppy',
  'horse', 'pony', 'donkey', 'camel', 'cow', 'cattle', 'goat', 'sheep', 'pig', 'alpaca', 'llama',
  'cheetah', 'lion', 'tiger', 'leopard', 'deer', 'gazelle', 'oryx',
]);

export function isSmallPet(species) {
  const s = String(species || '').trim().toLowerCase();
  return !NOT_SMALL.has(s);
}
