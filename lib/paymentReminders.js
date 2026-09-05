// lib/paymentReminders.js
// Shared invoice-balance math and reminder wording for chasing an
// outstanding balance — used by the client page's Financial Overview and
// the Accounting > Unpaid Invoices page. Reminders are wa.me/mailto: deep
// links, same as everywhere else messaging happens in this app: nothing
// is sent server-side, no delivery tracking, staff sends it themselves.

export function money(n) {
  return Number(n || 0).toFixed(2);
}

export function balanceDue(inv) {
  return Math.max(0, Number(inv.total || 0) - Number(inv.amount_paid || 0));
}

export function invoiceLabel(inv) {
  return inv.invoice_number ? `INV-${String(inv.invoice_number).padStart(6, '0')}` : (inv.id || '').slice(0, 8);
}

export function totalBalanceDue(invoices) {
  return invoices.reduce((sum, inv) => sum + balanceDue(inv), 0);
}

// One invoice's own reminder line — calls out any partial payment already
// received rather than just restating the invoice total.
function singleInvoiceLine(inv) {
  const due = balanceDue(inv);
  if (inv.status === 'partially_paid') {
    return `a remaining balance of AED ${money(due)} on ${invoiceLabel(inv)} (AED ${money(inv.amount_paid)} already received — thank you!)`;
  }
  return `${invoiceLabel(inv)} for AED ${money(due)}`;
}

// The message body shared by the WhatsApp and email reminders — one
// invoice reads as a direct reminder; several roll up into one total with
// each invoice broken out, so a client with more than one open invoice
// gets a single message instead of one per invoice.
export function reminderBody(clientName, invoices) {
  const name = clientName || 'there';
  if (invoices.length === 1) {
    return `Hi ${name}, this is a friendly reminder from Europets Clinic that ${singleInvoiceLine(invoices[0])} is still outstanding. Please let us know if you have any questions. Thank you!`;
  }
  const list = invoices.map((inv) => `${invoiceLabel(inv)} (AED ${money(balanceDue(inv))})`).join(', ');
  return `Hi ${name}, this is a friendly reminder from Europets Clinic that you have a total outstanding balance of AED ${money(totalBalanceDue(invoices))} across ${invoices.length} invoices: ${list}. Please let us know if you have any questions. Thank you!`;
}

function reminderSubject(invoices) {
  return invoices.length === 1
    ? `Payment Reminder — ${invoiceLabel(invoices[0])}`
    : 'Payment Reminder — Outstanding Balance';
}

// Returns false (and does nothing) when there's no phone/email to send
// to — callers disable the triggering button in that case, but this is
// the last line of defense against opening a broken wa.me/mailto: link.
export function openWhatsAppReminder(phone, clientName, invoices) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return false;
  window.open(`https://wa.me/${digits}?text=${encodeURIComponent(reminderBody(clientName, invoices))}`, '_blank');
  return true;
}

export function openEmailReminder(email, clientName, invoices) {
  if (!email) return false;
  const subject = reminderSubject(invoices);
  const body = reminderBody(clientName, invoices);
  window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
  return true;
}
