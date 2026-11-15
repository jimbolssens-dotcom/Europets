// lib/goesHome.js
// "🏠 Goes home" (Jim, 15 Nov; migration 254): whether a medicine on a
// record is one the owner takes home, kept apart from how it's charged.
// "Dispensed" (administration_method) still adds the dispensing fee; this
// decides whether the medicine gets a printable label (consult and
// invoice) and is offered in Home care. Worked out when read, in order:
//   1. a tap on the line's chip (treatment_items.goes_home true/false);
//   2. dispensed always goes home (as before);
//   3. a dose logged during a hospital stay is given here, not sent home;
//   4. the catalog's "Usually goes home" (goods_services.usually_goes_home);
//   5. instructions that only make sense at home ("twice daily for 7 days").

const HOME_INSTRUCTIONS =
  /\b(once|twice|three times|four times)\s+(a|per)\s+day\b|\b(once|twice)\s+daily\b|\bdaily\b|\bevery\s+\d+\s*(h|hrs?|hours?|days?|weeks?)\b|\bfor\s+\d+\s*(days?|weeks?|months?)\b|\b(sid|bid|tid|qid|q\d+h)\b|\bat home\b|\bmorning and (evening|night)\b/i;

export function homeStyleInstructions(text) {
  return HOME_INSTRUCTIONS.test(String(text || ''));
}

// t: a treatment_items row, with goods_services(usually_goes_home) joined.
export function itemGoesHome(t) {
  if (!t) return false;
  if (t.goes_home === true || t.goes_home === false) return t.goes_home;
  if (t.administration_method === 'dispense') return true;
  if (t.hospitalization_note_id) return false;
  if (t.goods_services?.usually_goes_home) return true;
  return homeStyleInstructions(t.instructions);
}

// An invoice line: dispensed, or made from a treatment item that goes home.
export function lineGoesHome(line, sourceItems = []) {
  if (line?.administration_method === 'dispense') return true;
  return sourceItems.some(itemGoesHome);
}
