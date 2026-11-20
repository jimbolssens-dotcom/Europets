// lib/standardSpay.js
// The clinic's standard spay (Jim, 20 Nov), used as the description of the
// surgery whenever a spay report is written, so a routine spay reads the
// same every time without dictating it. Whatever the vet dictated or typed
// for that patient comes on top and wins where it differs.

// "Spay" or "Spey" (the catalog has both, e.g. "Spey cat"), not a pyometra
// spay, which is an emergency surgery rather than the routine one.
export function isSpayProcedure(name) {
  const n = name || '';
  return /\bsp[ae]y|ovariohyster|\bOHE\b|\bOVH\b/i.test(n) && !/pyometra/i.test(n);
}

// The standard technique and aftercare for this patient, or null when it
// isn't a cat or a dog. A dog's suture size depends on its weight.
export function standardSpayNotes({ species, weightKg } = {}) {
  const kind = String(species || '').toLowerCase();
  const aftercare =
    'Aftercare: the wound is closed with a minimally invasive technique, so there is no special wound aftercare and no post-operative antibiotics are needed. A cone (Elizabethan collar) is worn for 5 days. Watch that the cone stays on, keep the wound clean and dry, and follow normal post-operative care.';
  if (kind === 'cat') {
    return [
      'Clinic standard technique for a cat spay (ovariohysterectomy):',
      'A ventral midline incision of approximately 1 cm, approximately 4 cm caudal to the umbilicus. The ovaries and uterus were exteriorised and ligated with Vicryl 2-0, then removed. The muscle layer was closed, and the skin was closed with an intradermal (buried) suture pattern.',
      aftercare,
    ].join('\n');
  }
  if (kind === 'dog') {
    const kg = Number(weightKg);
    const suture = kg > 0 ? (kg < 10 ? 'Vicryl 2-0' : 'Vicryl 0') : 'Vicryl';
    return [
      'Clinic standard technique for a dog spay (ovariohysterectomy):',
      `A ventral midline incision approximately 2 cm caudal to the umbilicus. The suspensory ligament was broken down to exteriorise the ovaries, and a full ovariohysterectomy was performed, ligating with ${suture}. The muscle layer was closed, and the skin was closed with an intradermal (buried) suture pattern.`,
      aftercare,
    ].join('\n');
  }
  return null;
}
