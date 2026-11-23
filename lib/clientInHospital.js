// lib/clientInHospital.js
// The client page's "In hospital" drop-down (app/_components/ClientInHospital.jsx):
// each open stay with its cage's name, newest first.

export function attachCageNames(stays, cages) {
  const name = new Map((cages || []).map((c) => [c.id, c.name]));
  return [...(stays || [])]
    .map((s) => ({ ...s, cageName: s.cage_id ? name.get(s.cage_id) || null : null }))
    .sort((a, b) => new Date(b.admitted_at) - new Date(a.admitted_at));
}
