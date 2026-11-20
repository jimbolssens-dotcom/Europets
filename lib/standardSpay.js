// lib/standardSpay.js
// The clinic's standard spay and castration (Jim, 20 Nov), used as the
// description of the surgery whenever such a report is written, so a
// routine one reads the same every time without dictating it. Whatever the
// vet dictated or typed for that patient comes on top and wins where it
// differs. Both have the same aftercare.

// "Spay" or "Spey" (the catalog has both, e.g. "Spey cat"), not a pyometra
// spay, which is an emergency surgery rather than the routine one.
export function isSpayProcedure(name) {
  const n = name || '';
  return /\bsp[ae]y|ovariohyster|\bOHE\b|\bOVH\b/i.test(n) && !/pyometra/i.test(n);
}

const AFTERCARE =
  'Aftercare: the surgery is done with a minimally invasive technique, so there is no special wound aftercare and no post-operative antibiotics are needed. A cone (Elizabethan collar) is worn for 5 days. Watch that the cone stays on, keep the wound clean and dry, and follow normal post-operative care.';

function vicrylFor(weightKg) {
  const kg = Number(weightKg);
  return kg > 0 ? (kg < 10 ? 'Vicryl 2-0' : 'Vicryl 0') : 'Vicryl';
}

// The standard technique and aftercare for this patient, or null when it
// isn't a cat or a dog. A dog's suture size depends on its weight.
export function standardSpayNotes({ species, weightKg } = {}) {
  const kind = String(species || '').toLowerCase();
  const aftercare = AFTERCARE;
  if (kind === 'cat') {
    return [
      'Clinic standard technique for a cat spay (ovariohysterectomy):',
      'A ventral midline incision of approximately 1 cm, approximately 4 cm caudal to the umbilicus. The ovaries and uterus were exteriorised and ligated with Vicryl 2-0, then removed. The muscle layer was closed, and the skin was closed with an intradermal (buried) suture pattern.',
      aftercare,
    ].join('\n');
  }
  if (kind === 'dog') {
    const suture = vicrylFor(weightKg);
    return [
      'Clinic standard technique for a dog spay (ovariohysterectomy):',
      `A ventral midline incision approximately 2 cm caudal to the umbilicus. The suspensory ligament was broken down to exteriorise the ovaries, and a full ovariohysterectomy was performed, ligating with ${suture}. The muscle layer was closed, and the skin was closed with an intradermal (buried) suture pattern.`,
      aftercare,
    ].join('\n');
  }
  return null;
}

// Not a cryptorchid castration: that's a different (often abdominal) surgery.
export function isCastrationProcedure(name) {
  const n = name || '';
  return /castrat|orchiectom|\bneuter/i.test(n) && !/cryptorchid/i.test(n) && !isSpayProcedure(n);
}

export function standardCastrationNotes({ species, weightKg } = {}) {
  const kind = String(species || '').toLowerCase();
  if (kind === 'cat') {
    return [
      'Clinic standard technique for a cat castration:',
      'Both testicles were removed through a single incision over the scrotum. The spermatic cord was ligated to the blood vessels.',
      AFTERCARE,
    ].join('\n');
  }
  if (kind === 'dog') {
    return [
      'Clinic standard technique for a dog castration:',
      `A pre-scrotal incision of approximately 3 cm. A closed castration was performed: the spermatic cords were crushed and ligated with ${vicrylFor(weightKg)}, and both testicles removed. The subcutaneous tissues were closed, and the skin was closed with an intradermal (buried) suture pattern.`,
      AFTERCARE,
    ].join('\n');
  }
  return null;
}

// The standard for a routine spay or castration by its procedure name, or
// null for any other surgery.
export function standardSurgeryNotes({ procedureName, species, weightKg } = {}) {
  if (isSpayProcedure(procedureName)) return standardSpayNotes({ species, weightKg });
  if (isCastrationProcedure(procedureName)) return standardCastrationNotes({ species, weightKg });
  return null;
}

export function isStandardSurgery(name) {
  return isSpayProcedure(name) || isCastrationProcedure(name);
}
