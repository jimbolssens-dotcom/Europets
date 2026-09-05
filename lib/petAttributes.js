// lib/petAttributes.js
// Species-aware breed/color option lists for the patient intake forms
// (desktop Add/Edit Patient and the public portal intake) — see
// PetAttributeField.jsx, which renders these as a dropdown with an
// "Other..." free-text escape hatch, same pattern as SpeciesField. Each
// list is ordered roughly most-to-least common, not alphabetically, since
// that's what actually saves taps in a dropdown.
//
// Cats and dogs get separate lists because they don't overlap much —
// coat colors especially: calico, tortoiseshell, and colorpoint (seal
// point, blue point, ...) patterns are cat-specific (calico in particular
// is a sex-linked genetic pattern that's virtually never seen in dogs).

export const CAT_BREEDS = [
  'Domestic Shorthair',
  'Domestic Longhair',
  'Persian',
  'Siamese',
  'Maine Coon',
  'British Shorthair',
  'Ragdoll',
  'Sphynx',
  'Bengal',
  'Scottish Fold',
];

export const DOG_BREEDS = [
  'Mixed Breed',
  'Labrador Retriever',
  'Golden Retriever',
  'German Shepherd',
  'French Bulldog',
  'Bulldog',
  'Poodle',
  'Beagle',
  'Rottweiler',
  'Yorkshire Terrier',
  'Dachshund',
  'Boxer',
  'Siberian Husky',
  'Great Dane',
  'Doberman Pinscher',
  'Shih Tzu',
  'Chihuahua',
  'Pomeranian',
  'Cavalier King Charles Spaniel',
  'Border Collie',
  'Australian Shepherd',
  'Cocker Spaniel',
  'Maltese',
  'Pug',
  'Shetland Sheepdog',
  'Saluki',
  'Basenji',
  'Belgian Malinois',
  'Akita',
  'Samoyed',
  'Jack Russell Terrier',
];

export const CAT_COLORS = [
  'Black',
  'White',
  'Brown Tabby',
  'Grey Tabby',
  'Orange Tabby',
  'Grey / Blue',
  'Orange / Ginger',
  'Cream',
  'Calico',
  'Tortoiseshell',
  'Tuxedo (Black & White)',
  'Seal Point',
  'Blue Point',
  'Chocolate Point',
];

export const DOG_COLORS = [
  'Black',
  'White',
  'Brown / Chocolate',
  'Golden / Yellow',
  'Cream',
  'Black & Tan',
  'Fawn',
  'Brindle',
  'Tricolor',
  'Red',
  'Grey / Blue',
  'Sable',
  'Merle',
  'Spotted',
];
