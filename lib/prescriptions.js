// lib/prescriptions.js
// Prescriptions for an outside pharmacy (Jim, 12 Nov; migration 249): the
// medicines and how to give them, checked before saving. Pure: used by the
// API route, the panel (app/_components/PrescriptionPanel.jsx) and tests.

export const RX_VALID_DAYS = 30;

export function rxNumber(n) {
  return `RX-${String(n || 0).padStart(6, '0')}`;
}

// The catalog name as a pharmacy should read it: no stock marks or
// "(per ml)" style billing notes.
export function rxMedName(name) {
  return String(name || '')
    .replace(/[\^*]+/g, '')
    .replace(/\s*\((?:per|each)[^)]*\)/gi, '')
    .replace(/\s+-\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Returns { items } ready to save, or { error }.
export function cleanRxItems(raw) {
  const items = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const name = rxMedName(r?.name).slice(0, 160);
    const directions = String(r?.directions || '').trim().slice(0, 400);
    const rest = {
      strength: String(r?.strength || '').trim().slice(0, 80),
      quantity: String(r?.quantity || '').trim().slice(0, 80),
      duration: String(r?.duration || '').trim().slice(0, 80),
    };
    if (!name && !directions && !rest.strength && !rest.quantity && !rest.duration) continue; // an empty row
    if (!name) return { error: 'Every medicine needs a name' };
    if (!directions) return { error: `Add how to give ${name}` };
    if (!rest.quantity) return { error: `Add how much ${name} to supply` };
    items.push({ name, ...rest, directions });
  }
  if (!items.length) return { error: 'Add at least one medicine' };
  if (items.length > 12) return { error: 'At most 12 medicines on one prescription' };
  return { items };
}

export function rxAge(dob) {
  if (!dob) return '';
  const months = Math.floor((Date.now() - new Date(`${dob}T00:00:00Z`).getTime()) / (30.44 * 86400000));
  if (months < 1) return 'under 1 month';
  if (months < 24) return `${months} month${months === 1 ? '' : 's'}`;
  return `${Math.floor(months / 12)} years`;
}
