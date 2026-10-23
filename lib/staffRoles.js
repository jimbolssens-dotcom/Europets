// lib/staffRoles.js
// The staff roles (staff.role). 'intern' is temporary staff (migration
// 223): a placeholder name is fine, and access_until switches them off.

export const STAFF_ROLES = ['vet', 'tech', 'intern', 'reception', 'cleaner', 'driver', 'admin'];

export const ROLE_NAMES = {
  vet: 'Vet',
  tech: 'Tech',
  intern: 'Intern (temporary)',
  reception: 'Reception',
  cleaner: 'Cleaner',
  driver: 'Driver',
  admin: 'Admin',
};

// The next placeholder name for a new intern: "Intern 1", "Intern 2"...
export function nextInternName(staff) {
  const used = new Set((staff || []).map((s) => String(s.full_name || '').trim().toLowerCase()));
  let n = 1;
  while (used.has(`intern ${n}`)) n += 1;
  return `Intern ${n}`;
}

// Whether someone's access has run out: after their access_until day
// (UAE dates, YYYY-MM-DD).
export function accessExpired(staff, todayISO) {
  return !!staff?.access_until && String(staff.access_until) < todayISO;
}
