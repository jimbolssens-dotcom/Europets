// lib/procedureLabel.js
// What to call a dental/surgery appointment (appointments.type 'surgery')
// in client-facing text — "a spay", "a castration", "a dental", or plain
// "surgery". There's no structured column for the procedure: staff type
// it into appointments.reason by hand ("Castration", "SPay", "Caastration",
// "castration + dental cleaning", "Pyometra spay", "SX hernia"...), and
// the concierge/intake paths write "Client-requested Spay" etc. So this
// only names the procedure when the reason is clearly nothing BUT spay /
// castration / dental (alone or combined); anything else left over — a
// lump removal, a pyometra, a fracture, a typo it can't place — falls
// back to "surgery", which is never wrong, rather than risk telling a
// client their pet is in for a routine spay when it's something bigger.

const KINDS = [
  { label: 'spay', pattern: /\bspay(ed|ing)?\b/gi },
  { label: 'castration', pattern: /\bca+str(ation|ate|ated)?\b|\bneuter(ing)?\b/gi },
  { label: 'dental', pattern: /\bdental\b|\bteeth\b|\btooth\b/gi },
];

// Words that can sit next to a simple procedure without making it
// anything more: dental qualifiers, joiners, and the "Client-requested"
// prefix the booking paths add.
const FILLER = /\b(client-requested|client|requested|cleaning|clean|descaling|descale|scale|scaling|polish|extractions?|removal|and|with|plus)\b|[+/&,.\-:]/gi;

export function procedureLabel(reason) {
  const text = (reason || '').toLowerCase();
  if (!text.trim()) return 'surgery';

  const found = [];
  let rest = text;
  for (const kind of KINDS) {
    if (text.match(kind.pattern)) found.push(kind.label);
    rest = rest.replace(kind.pattern, ' ');
  }
  rest = rest.replace(FILLER, ' ').trim();

  if (found.length === 0 || rest) return 'surgery';
  const joined = found.length === 1 ? found[0] : `${found.slice(0, -1).join(', ')} and ${found[found.length - 1]}`;
  return `a ${joined}`;
}
