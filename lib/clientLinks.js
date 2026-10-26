// lib/clientLinks.js
// The links the WhatsApp concierge (lib/whatsappConcierge.js) can send, and
// when each one is the answer. Jim: "the AI should be well aware of all the
// possible links that are present in the app, and if applicable divert
// people to those" (an update request goes to the pet's live updates page,
// an unregistered pet to the registration form). Pure, so it can be tested
// (tests/client-links.test.mjs).

// app: the clinic app (portal.epc.vet); site: the website (epc.vet).
// stays: pets staying with us now, [{ name, id }] (the hospitalization id).
export function clientLinksSection({ app, site, clientId = null, stays = [] }) {
  const lines = [];
  if (clientId) {
    lines.push(
      `- Their client app: ${app}/client-app (they log in with this WhatsApp number and a code we send here). It has each pet's records and reports (consult and hospital summaries, lab, X-ray, ultrasound, dental and surgery reports), their invoices as PDFs, their appointments, the vaccinations due, and cattery bookings. Send it when they ask for a copy of an invoice or a report, their pet's records or vaccination history, or what's booked or due.`
    );
    for (const s of stays) {
      lines.push(
        `- ${s.name}'s live updates page (they're with us now): ${app}/portal/hospitalization/${s.id} . When they ask how ${s.name} is doing or for an update, send this link. If they asked something specific (a result, when they can go home), still hand that part to staff.`
      );
    }
    lines.push(
      `- Paying their open bills online: ${site}/settle-bill/owner/${clientId} . Send it when they ask how to pay or for a payment link. Questions about an amount, a charge or a refund still go to staff.`
    );
    lines.push(`- Booking a stay at our cattery: ${app}/client-app/cattery/new`);
    lines.push(
      '- A pet that isn\'t on file yet: call send_intake_link for their own registration form and send that link warmly (it takes a couple of minutes, and they can say there what they\'d like booked). Once it\'s in, the team adds the pet and confirms.'
    );
  } else {
    lines.push(
      '- The new-client form: call send_intake_link for their own link. It registers them and their pet, and they can say what they\'d like booked.'
    );
  }
  lines.push(`- Our services: ${site}/services ; the team: ${site}/team ; reviews from our clients: ${site}/reviews ; what to know before a first visit: ${site}/new-patients`);
  return `Links you can send (on its own line, exactly as written). When one of these is what the client needs, send it rather than saying the team will send something:\n${lines.join('\n')}\n`;
}
