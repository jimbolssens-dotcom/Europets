// lib/healthCertificate.js
// What goes on an export health certificate (migration 231,
// lib/healthCertificatePdf.js), from the patient's own records. Built
// around what border vets and the export permit check, the common core of
// the WOAH model certificate for dogs and cats (Terrestrial Code ch. 5.11),
// the EU pet-travel certificate and the UAE export rules: owner, the
// animal, its microchip, rabies vaccination with its validity, the other
// vaccines, parasite treatments, countries visited, and the vet's
// examination, signed with their licence number. English only. Pure, so it
// can be tested (tests/health-certificate.test.mjs).

// The products the clinic gives, for the vaccine lines (editable on the form).
export const VACCINE_PRODUCTS = {
  'cat:rabies': 'Biocan R (Bioveta)',
  'dog:rabies': 'Biocan R (Bioveta)',
  'cat:core': 'Biofel PCH (Bioveta)',
  'dog:core': 'Biocan DHPPi+L (Bioveta)',
};

export const DEFAULT_VISITED = 'None (resident in the United Arab Emirates)';

export const CERTIFICATION_STATEMENT =
  'I, the undersigned veterinarian, certify that on the date of examination shown below I examined the animal described above, that it showed no clinical signs of infectious or contagious disease, including rabies, and no infestation with external parasites, and that it is fit to travel. The identification, vaccination and treatment details above are true and correct according to the records of this clinic.';

const SEX = {
  male: 'Male',
  female: 'Female',
  male_castrated: 'Male, neutered',
  female_spayed: 'Female, spayed',
  unknown: 'Unknown',
};

export function sexLabel(sex) {
  return SEX[sex] || (sex ? String(sex).replace(/_/g, ' ') : '');
}

// A 15-digit chip is the ISO 11784/11785 standard border vets expect.
export function isIsoMicrochip(number) {
  return /^\d{15}$/.test(String(number || '').replace(/\s/g, ''));
}

// Age on the day, e.g. "4 months" or "2 years 3 months".
export function ageOn(dateOfBirth, onDate) {
  if (!dateOfBirth || !onDate) return null;
  const [by, bm, bd] = String(dateOfBirth).slice(0, 10).split('-').map(Number);
  const [y, m, d] = String(onDate).slice(0, 10).split('-').map(Number);
  let months = (y - by) * 12 + (m - bm) - (d < bd ? 1 : 0);
  if (!Number.isFinite(months) || months < 0) return null;
  const years = Math.floor(months / 12);
  months %= 12;
  if (!years) return `${months} month${months === 1 ? '' : 's'}`;
  return `${years} year${years === 1 ? '' : 's'}${months ? ` ${months} month${months === 1 ? '' : 's'}` : ''}`;
}

const daysBetween = (a, b) => Math.round((Date.parse(`${String(b).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(a).slice(0, 10)}T00:00:00Z`)) / 86400000);

// The latest dose given of each vaccine, on or before the exam date, with
// whether the rabies dose is valid on the travel date (at least 21 days
// after it was given, and not past its next due date).
export function certificateVaccines({ vaccinations, protocols, species, examDate, travelDate }) {
  const byId = new Map((protocols || []).map((p) => [p.id, p]));
  const latest = new Map();
  for (const v of vaccinations || []) {
    if (!v.date_given || String(v.date_given) > String(examDate)) continue;
    const prev = latest.get(v.vaccine_protocol_id);
    if (!prev || String(v.date_given) > String(prev.date_given)) latest.set(v.vaccine_protocol_id, v);
  }
  const rows = [...latest.values()].map((v) => {
    const p = byId.get(v.vaccine_protocol_id) || {};
    const kind = p.is_rabies ? 'rabies' : p.core ? 'core' : 'other';
    return {
      kind,
      disease: p.name || v.vaccine_name,
      product: VACCINE_PRODUCTS[`${species}:${kind}`] || p.name || v.vaccine_name,
      date_given: v.date_given,
      valid_until: v.next_due_date || null,
      batch: v.batch_number || null,
    };
  });
  rows.sort((a, b) => (a.kind === 'rabies' ? -1 : b.kind === 'rabies' ? 1 : String(b.date_given).localeCompare(String(a.date_given))));
  const rabies = rows.find((r) => r.kind === 'rabies') || null;
  const on = travelDate || examDate;
  const warnings = [];
  if (!rabies) warnings.push('No rabies vaccination on file.');
  else {
    if (daysBetween(rabies.date_given, on) < 21) warnings.push(`Rabies was given less than 21 days before ${travelDate ? 'travel' : 'the exam'}.`);
    if (rabies.valid_until && String(rabies.valid_until) < String(on)) warnings.push(`Rabies vaccination expired on ${rabies.valid_until}.`);
  }
  return { rows, rabies, warnings };
}

// Everything printed, as saved on the certificate (health_certificates.data).
export function buildCertificateData({ patient, client, clinic, vet, vaccinations, protocols, form, now = Date.now() }) {
  const examDate = form.exam_date;
  const species = patient.species === 'cat' || patient.species === 'dog' ? patient.species : String(patient.species || '').toLowerCase();
  const vaccines = certificateVaccines({ vaccinations, protocols, species, examDate, travelDate: form.travel_date });
  const warnings = [...vaccines.warnings];
  if (!patient.microchip_number) warnings.push('No microchip number on file.');
  else if (!isIsoMicrochip(patient.microchip_number)) warnings.push('The microchip number is not a 15-digit ISO 11784/11785 number.');
  if (!vet?.licence_number) warnings.push("The signing vet's licence number isn't on their staff profile.");
  return {
    clinic: { name: clinic?.legal_name || 'Europets Veterinary Clinic', address: clinic?.address || '', phone: clinic?.phone || '', email: clinic?.email || '' },
    owner: { name: client?.full_name || '', address: form.owner_address ?? client?.address ?? '', phone: client?.phone || '' },
    animal: {
      name: patient.name,
      species: patient.species ? patient.species[0].toUpperCase() + patient.species.slice(1) : '',
      breed: patient.breed || '',
      sex: sexLabel(patient.sex),
      date_of_birth: patient.date_of_birth || null,
      date_of_birth_estimated: !!patient.date_of_birth_estimated,
      age: ageOn(patient.date_of_birth, examDate),
      colour: patient.color || '',
      weight_kg: patient.current_weight_kg != null ? Number(patient.current_weight_kg) : null,
    },
    microchip: {
      number: patient.microchip_number || '',
      implanted_at: patient.microchip_implanted_at || null,
      location: form.microchip_location || 'Left side of the neck',
      iso: isIsoMicrochip(patient.microchip_number),
    },
    vaccines: vaccines.rows,
    parasites: {
      internal: { product: form.internal_product || '', date: form.internal_date || null },
      external: { product: form.external_product || '', date: form.external_date || null },
    },
    travel: { destination: form.destination || '', date: form.travel_date || null, visited: form.visited || DEFAULT_VISITED },
    remarks: form.remarks || '',
    exam_date: examDate,
    statement: CERTIFICATION_STATEMENT,
    vet: { name: vet?.full_name || '', licence_number: vet?.licence_number || '' },
    warnings,
    issued_at: new Date(now).toISOString(),
  };
}
