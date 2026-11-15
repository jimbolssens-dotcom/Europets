// lib/chatAvatar.js
// The picture beside a conversation in Messages (Jim, 15 Nov). WhatsApp's
// business API never shares a customer's profile picture, so a chat shows
// the client's pets instead: their profile photos (patients.
// profile_photo_url, migration 129), else the first pet's species, else the
// client's initials. Used by app/_components/ChatAvatar.jsx.

const SPECIES_ICONS = [
  [/cat|feline|kitten/i, '🐱'],
  [/dog|canine|puppy/i, '🐶'],
  [/rabbit|bunny/i, '🐰'],
  [/bird|parrot|avian|budgie|cockatiel|canary/i, '🦜'],
  [/guinea|hamster|rat|mouse|gerbil|chinchilla|rodent/i, '🐹'],
  [/turtle|tortoise/i, '🐢'],
  [/snake|lizard|gecko|iguana|reptile|dragon/i, '🦎'],
  [/fish/i, '🐟'],
  [/ferret/i, '🦦'],
  [/horse|pony/i, '🐴'],
];

export function speciesIcon(species) {
  const s = String(species || '');
  for (const [re, icon] of SPECIES_ICONS) if (re.test(s)) return icon;
  return null;
}

// A client's pets as the avatar needs them: living ones only, those with
// a photo first, at most `max`. Accepts patient rows or its own output
// (the inbox API sends that already trimmed).
export function avatarPets(pets, max = 2) {
  return (pets || [])
    .filter((p) => p && !p.deceased && !p.rehomed)
    .sort((a, b) => Number(!!(b.photo || b.profile_photo_url)) - Number(!!(a.photo || a.profile_photo_url)))
    .slice(0, max)
    .map((p) => ({ name: p.name || '', species: p.species || '', photo: p.photo || p.profile_photo_url || null }));
}

// "Sarah O'Brien-Smith" -> "SO"; "+971 50…" or empty -> "?".
export function initials(name) {
  const words = String(name || '').replace(/[^\p{L}\s'-]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// A steady soft colour per name, so a client keeps the same circle.
export function avatarHue(key) {
  let h = 0;
  for (const ch of String(key || '')) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

// What to draw: { kind: 'photos', photos: [{src, name}] } | { kind:
// 'species', icon, name } | { kind: 'initials', text, hue }.
export function chatAvatar({ clientName, pets }) {
  const list = avatarPets(pets);
  const photos = list.filter((p) => p.photo).map((p) => ({ src: p.photo, name: p.name }));
  if (photos.length) return { kind: 'photos', photos };
  const icon = list.length ? speciesIcon(list[0].species) : null;
  if (icon) return { kind: 'species', icon, name: list[0].name, hue: avatarHue(clientName) };
  return { kind: 'initials', text: initials(clientName), hue: avatarHue(clientName) };
}
