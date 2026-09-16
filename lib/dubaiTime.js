// lib/dubaiTime.js
// Europets operates in Dubai (UTC+4, no daylight-saving time). Shared by
// server routes and client components alike that need to know "has it
// passed noon/18:00 today" — the boundary for a morning/afternoon
// worksheet update (app/api/hospitalizations/route.js) and for the
// Temperature/Weight Day Treatment Plan items (same file, and
// DayTreatmentPlan.jsx's own live status badge).

const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export function dubaiDayBoundaries(now = new Date()) {
  const shifted = new Date(now.getTime() + DUBAI_OFFSET_MS);
  const startUtcMs =
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - DUBAI_OFFSET_MS;

  return {
    nowMs: now.getTime(),
    startUtcMs,
    noonUtcMs: startUtcMs + 12 * HOUR_MS,
    eveningUtcMs: startUtcMs + 18 * HOUR_MS,
  };
}
