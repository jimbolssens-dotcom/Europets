// lib/invoicePets.js
// Which pet(s) an invoice is for, as "Bella #24241" (Jim, 17 Nov: shown on
// each invoice in the client app's list). From the consult or hospital stay
// it came from, or the cattery booking it bills (every cat in a shared
// bungalow). A product sale has none. Reads the joins the invoice list
// already returns (app/api/invoices LIST_SELECT). Pure.

export function invoicePets(inv) {
  if (!inv) return [];
  const cattery = (inv.cattery_bookings || []).flatMap((b) => [b.patients, ...(b.cattery_booking_cats || []).map((c) => c.patients)]);
  const pets = [inv.visits?.patients, inv.hospitalizations?.patients, ...cattery].filter((p) => p && p.name);
  const seen = new Set();
  return pets.filter((p) => {
    const key = `${p.name}#${p.patient_number ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function invoicePetsLabel(inv) {
  return invoicePets(inv)
    // A no-break space: a name never wraps away from its number.
    .map((p) => (p.patient_number ? `${p.name}\u00a0#${p.patient_number}` : p.name))
    .join(', ');
}
