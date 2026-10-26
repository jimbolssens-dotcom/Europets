// lib/vaccinationCourse.js
// The primary vaccination course, for the vaccination card
// (app/_components/useVaccinations.js). Pure, so it can be tested
// (tests/vaccination-course.test.mjs).
//
// The clinic's course, cats and dogs alike: the core vaccine (PCH for cats,
// DHPPi + Lepto for dogs) at 2 months, then the core vaccine again plus
// rabies a month later. All of it is charged at the first visit; the
// booster visit is free. An animal 3 months or older at its first visit has
// rabies then, and the booster is the core vaccine only.

// Rabies goes in at the first visit from this age.
export const RABIES_FROM_MONTHS = 3;
// A Primary visit older than this no longer waits on its booster.
const COURSE_OPEN_DAYS = 90;

// Whole months from birth to onDate (YYYY-MM-DD), or null without a birth date.
export function ageInMonths(dateOfBirth, onDate) {
  if (!dateOfBirth || !onDate) return null;
  const [by, bm, bd] = String(dateOfBirth).slice(0, 10).split('-').map(Number);
  const [y, m, d] = String(onDate).slice(0, 10).split('-').map(Number);
  if (![by, bm, bd, y, m, d].every(Number.isFinite)) return null;
  let months = (y - by) * 12 + (m - bm);
  if (d < bd) months -= 1;
  return months;
}

// The Primary visit still waiting on its booster, or null: its core-vaccine
// dose (the course), its booster date, and the rabies reminder made for it
// when rabies wasn't given then (that reminder is filled in at the booster).
export function openPrimaryCourse(vaccinations, protocols, today) {
  const byId = new Map((protocols || []).map((p) => [p.id, p]));
  const isCore = (v) => byId.get(v.vaccine_protocol_id)?.core && !byId.get(v.vaccine_protocol_id)?.is_rabies;
  const isRabies = (v) => !!byId.get(v.vaccine_protocol_id)?.is_rabies;
  const boosted = new Set((vaccinations || []).map((v) => v.booster_of).filter(Boolean));
  const courses = (vaccinations || [])
    .filter((v) => v.is_primary && v.date_given && isCore(v) && !boosted.has(v.id))
    .filter((v) => (Date.parse(today) - Date.parse(v.date_given)) / 86400000 <= COURSE_OPEN_DAYS)
    .sort((a, b) => String(b.date_given).localeCompare(String(a.date_given)));
  const course = courses[0];
  if (!course) return null;
  const rabiesReminder =
    (vaccinations || []).find((v) => v.is_primary && !v.date_given && isRabies(v) && v.next_due_date === course.next_due_date) || null;
  return { course, boosterDue: course.next_due_date, rabiesReminder };
}

// Which boxes start ticked. At the booster: the core vaccine, and rabies if
// it was held back at the first visit. At a first vaccination (no dose on
// file yet): the core vaccine, and rabies from 3 months old. Otherwise
// none, as before.
export function defaultVaccineTicks({ protocols, vaccinations, dateOfBirth, dateGiven, openCourse }) {
  const core = (protocols || []).find((p) => p.core && !p.is_rabies);
  const rabies = (protocols || []).find((p) => p.is_rabies);
  if (!core) return [];
  if (openCourse) return [core.id, ...(openCourse.rabiesReminder && rabies ? [rabies.id] : [])];
  const anyGiven = (vaccinations || []).some((v) => v.date_given);
  if (anyGiven) return [];
  const age = ageInMonths(dateOfBirth, dateGiven);
  return [core.id, ...(rabies && age != null && age >= RABIES_FROM_MONTHS ? [rabies.id] : [])];
}
