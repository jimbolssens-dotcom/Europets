// lib/consentTemplates.js
// The canonical text for each consent form type, and the shared liability/
// authorization clause appended to all of them. Isomorphic (no server-only
// imports) so the same wording can be shown as a live preview in the
// browser before signing, and regenerated server-side as the authoritative
// text stamped onto the signed record (consent_forms.form_text) — the
// server never trusts client-supplied text for this.
//
// Not legal advice — a lawyer should review this wording before relying on
// it for a real clinic.

import { isSpayNeuterProduct } from './spayNeuterProduct';
import { isDentalProduct } from './dentalProduct';

export const CONSENT_FORM_TYPES = ['surgery_standard_neuter', 'surgery_complex', 'hospitalization', 'dental', 'day_procedure'];

export const CONSENT_FORM_LABELS = {
  surgery_standard_neuter: 'Surgery Consent — Standard Neutering',
  surgery_complex: 'Surgery Consent — Complex / High-Risk Procedure',
  hospitalization: 'Hospitalization Consent',
  dental: 'Dental Procedure Consent',
  day_procedure: 'Day Procedure Consent',
};

// Surgery/dental forms attach to a consult (visit_id); the hospitalization
// and day procedure forms attach to an admission (hospitalization_id) — a
// day procedure is a same-day hospitalizations row (see migration 088).
export const CONSENT_FORM_ATTACHMENT = {
  surgery_standard_neuter: 'visit',
  surgery_complex: 'visit',
  hospitalization: 'hospitalization',
  dental: 'visit',
  day_procedure: 'hospitalization',
};

const LIABILITY_CLAUSE = `I understand that veterinary medicine, like human medicine, is not an exact science, and that no guarantee, express or implied, has been made or can be made as to the outcome of any diagnostic test, treatment, procedure, or surgery performed on my pet. I acknowledge that complications and adverse reactions — including, in rare cases, death — can occur even when care is provided correctly and with reasonable skill.

I authorize Europets Veterinary Clinic and its veterinarians and staff to perform the care described above, together with any additional diagnostic tests, treatment, procedures, or surgery that the attending veterinarian, in their professional judgment, believes to be necessary or in the best interest of my pet during this visit or admission. Europets will make reasonable efforts to reach me before proceeding with any such additional or emergency care; if I cannot be reached in a timely manner, I authorize Europets to proceed with whatever care it judges appropriate without further consent. I accept full financial responsibility for all diagnostic tests, treatment, procedures, medication, and services provided to my pet, whether specifically described above or subsequently deemed necessary.`;

const SIGNATURE_NOTE = `By typing my full name below and submitting this form, I confirm that I have read and understood this consent form in full, that I agree to its terms, and that I am the owner of the pet named above or an individual authorized to make decisions on the owner's behalf.`;

function surgeryStandardNeuterBody({ patientName = 'my pet', sex } = {}) {
  const tattooLine =
    sex === 'female'
      ? `As ${patientName} is female, I understand and consent that a small tattoo will be placed in her left ear at the time of surgery, as a permanent visual record that she has been spayed.`
      : `I understand and consent that, if ${patientName} is female, a small tattoo will be placed in her left ear at the time of surgery, as a permanent visual record that she has been spayed.`;

  return [
    `I consent to ${patientName} undergoing a standard spay (ovariohysterectomy) or neuter (castration) procedure under general anesthesia, performed by a veterinarian at Europets Veterinary Clinic.`,
    `I understand this is considered a routine surgical procedure, but that — as with any procedure requiring general anesthesia — some level of risk is always present.`,
    tattooLine,
  ].join('\n\n');
}

function surgeryComplexBody({ patientName = 'my pet' } = {}) {
  return [
    `I consent to ${patientName} undergoing the surgical procedure described on file, under general anesthesia, performed by a veterinarian at Europets Veterinary Clinic.`,
    `I understand that this procedure is more complex and/or carries a higher level of risk than a routine surgery, and I have had the opportunity to discuss these risks with the attending veterinarian. I understand and acknowledge that:`,
    `• General anesthesia carries inherent risk, including in rare cases serious complications or death, and that this risk may be increased by my pet's age, breed, underlying health conditions, or the nature of the procedure itself.\n• Surgery of this nature carries a meaningful risk of complications, including but not limited to bleeding, infection, delayed healing, adverse anesthetic reaction, or the need for further surgery or treatment.\n• A successful surgical or medical outcome cannot be assured, no matter the skill and care applied by the veterinary team.`,
  ].join('\n\n');
}

function hospitalizationBody({ patientName = 'my pet' } = {}) {
  return [
    `I consent to ${patientName} being admitted to Europets Veterinary Clinic for hospitalization, observation, and any diagnostic testing, treatment, or medication that the attending veterinary team deems necessary during their stay.`,
    `I understand that hospitalized patients may be critically ill or unstable, and that despite appropriate monitoring and care, a pet's condition can change or deteriorate while in hospital, and that some conditions carry a risk of complications or death regardless of the treatment provided.`,
  ].join('\n\n');
}

// A day procedure's checklist is a mix of anything (a vaccine, a
// microchip, a nail trim...), but a few need their own specific consent
// language folded in, not just the generic day-patient paragraph below —
// reuses the same body text as the standalone surgery_standard_neuter/
// dental/surgery_complex forms verbatim, so there's one place each
// wording lives. A checklist item flagged is_surgical (set by the AI
// dictation extraction or by staff on the checklist itself — see
// lib/checklistItemAction.js) means an actual operative procedure beyond
// a routine spay/neuter is planned (a fracture repair, mass removal,
// ...), so the same complex/high-risk language a standalone
// surgery_complex form carries gets folded in here too — a day procedure
// can now carry one of these without a separate consult (see the
// hospitalization page's "Book Day Procedure"), so its consent needs to
// actually say so.
function dayProcedureBody({ patientName = 'my pet', sex, treatmentItems = [] } = {}) {
  const itemName = (item) => item.goods_services?.name || item.label || '';
  const includesSpayNeuter = treatmentItems.some((item) => isSpayNeuterProduct(itemName(item)));
  const includesDental = treatmentItems.some((item) => isDentalProduct(itemName(item)));
  // Excludes anything already covered by the spay/neuter or dental
  // language above, so an item classified as one of those never also
  // stacks the higher-risk wording on top of its own accurate one.
  const includesAdvancedSurgery = treatmentItems.some(
    (item) => item.is_surgical && !isSpayNeuterProduct(itemName(item)) && !isDentalProduct(itemName(item))
  );

  return [
    `I consent to ${patientName} being dropped off at Europets Veterinary Clinic as a day patient — admitted in the morning and ready for collection the same day — for the procedures/services listed below.`,
    includesSpayNeuter ? surgeryStandardNeuterBody({ patientName, sex }) : null,
    includesDental ? dentalBody({ patientName }) : null,
    includesAdvancedSurgery ? surgeryComplexBody({ patientName }) : null,
    `I understand that some of these may require sedation or general anesthesia, and that as with any such procedure some level of risk is always present, including in rare cases serious complications or death. I understand that the exact procedures needed may only become fully clear once ${patientName} is examined or sedated, and I authorize the attending veterinary team to adjust the plan accordingly, as covered by the authorization below.`,
  ].filter(Boolean).join('\n\n');
}

function dentalBody({ patientName = 'my pet' } = {}) {
  return [
    `I consent to ${patientName} undergoing a dental examination, cleaning (scaling/polishing), and any dental treatment — including tooth extraction — that the attending veterinarian determines to be necessary, under general anesthesia, at Europets Veterinary Clinic.`,
    `I understand that the full extent of dental disease is often only apparent once a pet is under anesthesia, and that this may mean additional procedures — including extractions — are required beyond what could be assessed during a conscious oral exam. As with any procedure under general anesthesia, some level of risk is always present, including in rare cases serious complications or death.`,
  ].join('\n\n');
}

const BODY_BUILDERS = {
  surgery_standard_neuter: surgeryStandardNeuterBody,
  surgery_complex: surgeryComplexBody,
  hospitalization: hospitalizationBody,
  dental: dentalBody,
  day_procedure: dayProcedureBody,
};

// Folds the consult's own treatment plan into the form so the specific
// procedures/medications being consented to are spelled out, not just the
// generic body text above — treatmentNotes is the visit's free-text
// summary, treatmentItems the itemized plan (each optionally with its own
// instructions). Either or both may be empty (e.g. a hospitalization
// admitted with no prior consult, or before any plan items were added),
// in which case the whole section is omitted rather than printing an
// empty heading. Also accepts a day procedure's dictated checklist
// (hospitalization_plan_items — see /api/hospitalizations/:id/plan-items)
// as-is: each row already carries the same goods_services join, falling
// back to its own free-text `label` when nothing in the catalog matched.
function formatTreatmentPlanSection({ treatmentNotes, treatmentItems } = {}) {
  const notes = treatmentNotes?.trim();
  const items = (treatmentItems || []).filter((item) => item.goods_services?.name || item.label || item.instructions);
  if (!notes && items.length === 0) return null;

  const itemLines = items
    .map((item) => {
      const name = item.goods_services?.name || item.label || 'Item';
      return item.instructions ? `• ${name} — ${item.instructions}` : `• ${name}`;
    })
    .join('\n');

  return ['Planned treatment for this visit:', notes, itemLines].filter(Boolean).join('\n\n');
}

// The full text of a consent form for a given patient — the body specific
// to formType, the consult's own treatment plan (if any — see
// formatTreatmentPlanSection), then the shared liability/authorization
// clause, then the signature acknowledgment. This is what gets shown for
// review and, once signed, snapshotted verbatim onto the record.
export function buildConsentFormText(formType, patient = {}, treatmentPlan = {}) {
  const buildBody = BODY_BUILDERS[formType];
  if (!buildBody) return null;

  const patientName = patient.name ? `my pet, ${patient.name},` : 'my pet';
  const planSection = formatTreatmentPlanSection(treatmentPlan);
  return [buildBody({ ...patient, patientName, treatmentItems: treatmentPlan.treatmentItems || [] }), planSection, LIABILITY_CLAUSE, SIGNATURE_NOTE]
    .filter(Boolean)
    .join('\n\n');
}
