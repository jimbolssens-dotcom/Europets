// lib/messageAssignees.js
// Who a Messages conversation can be assigned to (app/(admin)/messages,
// app/mobile/messages): the vets and techs, and admin, who handles finance
// (bills, payments, refunds), listed last and marked as such.

const ORDER = { vet: 0, tech: 1, admin: 2 };

export function messageAssignees(staff) {
  return (Array.isArray(staff) ? staff : [])
    .filter((s) => s.role in ORDER && s.active !== false)
    .sort((a, b) => ORDER[a.role] - ORDER[b.role]);
}

export function assigneeLabel(s) {
  return s.role === "admin" ? `${s.full_name} · finance` : s.full_name;
}
