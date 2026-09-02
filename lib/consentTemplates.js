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

export const CONSENT_FORM_TYPES = ['surgery_standard_neuter', 'surgery_complex', 'hospitalization', 'dental'];

export const CONSENT_FORM_LABELS = {
  surgery_standard_neuter: 'Surgery Consent — Standard Neutering',
  surgery_complex: 'Surgery Consent — Complex / High-Risk Procedure',
  hospitalization: 'Hospitalization Consent',
  dental: 'Dental Procedure Consent',
};

// Surgery/dental forms attach to a consult (visit_id); the hospitalization
// form attaches to an admission (hospitalization_id).
export const CONSENT_FORM_ATTACHMENT = {
  surgery_standard_neuter: 'visit',
  surgery_complex: 'visit',
  hospitalization: 'hospitalization',
  dental: 'visit',
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
};

// The full text of a consent form for a given patient — the body specific
// to formType, then the shared liability/authorization clause, then the
// signature acknowledgment. This is what gets shown for review and, once
// signed, snapshotted verbatim onto the record.
export function buildConsentFormText(formType, patient = {}) {
  const buildBody = BODY_BUILDERS[formType];
  if (!buildBody) return null;

  const patientName = patient.name ? `my pet, ${patient.name},` : 'my pet';
  return [buildBody({ ...patient, patientName }), LIABILITY_CLAUSE, SIGNATURE_NOTE].join('\n\n');
}
