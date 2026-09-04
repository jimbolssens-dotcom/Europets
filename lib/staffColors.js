// lib/staffColors.js
// Shared per-staff color-coding, used by both the Appointments schedule
// grid (app/(admin)/appointments) and the Staff Roster
// (app/(admin)/staff/roster) so the same staff member reads the same
// color in both places. A staff member's own chosen color (set on the
// Staff page — staff.color, a hex string) always wins; anyone who hasn't
// picked one falls back to this fixed palette, assigned by their position
// in the given staff list, so everyone still gets a distinct, stable
// color without having to pick one.

export const STAFF_PALETTE = [
  { bg: '#dbeafe', fg: '#1d4ed8' },
  { bg: '#dcfce7', fg: '#15803d' },
  { bg: '#fef3c7', fg: '#b45309' },
  { bg: '#ede9fe', fg: '#6d28d9' },
  { bg: '#cffafe', fg: '#0e7490' },
  { bg: '#ffe4e6', fg: '#be123c' },
  { bg: '#ecfccb', fg: '#4d7c0f' },
  { bg: '#fae8ff', fg: '#a21caf' },
];

export const UNASSIGNED_STAFF_COLOR = { bg: '#f3f4f6', fg: '#4b5563' };

// The bg tint is derived from the chosen color itself (hex + alpha)
// rather than asking for two colors, matching how the palette's own
// bg/fg pairs read (a pale tint behind a solid border/text color).
export function buildStaffColorMap(staffList) {
  const map = {};
  (staffList || []).forEach((s, i) => {
    map[s.id] = s.color ? { bg: `${s.color}22`, fg: s.color } : STAFF_PALETTE[i % STAFF_PALETTE.length];
  });
  return map;
}
