// lib/bodyTemperature.js
// A body temperature is always between 32 and 42 °C (Jim: "anything else is
// not possible"). Checked on every save (consult vitals, hospital worksheet
// entries, check-ins), enforced by the database too (migration 233), and a
// dictated reading is tidied first: "three eight nine" heard as 389 is
// 38.9, anything still impossible is dropped rather than saved. Pure, so
// it can be tested (tests/body-temperature.test.mjs).

export const TEMP_MIN_C = 32;
export const TEMP_MAX_C = 42;
export const TEMP_RANGE_ERROR = `Body temperature must be between ${TEMP_MIN_C} and ${TEMP_MAX_C} °C.`;

const inRange = (n) => Number.isFinite(n) && n >= TEMP_MIN_C && n <= TEMP_MAX_C;

// For a typed value: null/'' is fine (no reading), anything else must be in range.
export function temperatureError(value) {
  if (value === null || value === undefined || value === '') return null;
  return inRange(Number(value)) ? null : TEMP_RANGE_ERROR;
}

// For a dictated value: the reading, a missed decimal point put back, or null.
export function dictatedTemperature(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (inRange(n)) return n;
  if (inRange(n / 10)) return Math.round(n) / 10;
  return null;
}
