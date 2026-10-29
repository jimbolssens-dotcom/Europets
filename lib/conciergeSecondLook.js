// lib/conciergeSecondLook.js
// The pet list the WhatsApp concierge works from, and the instructions for
// its second look (lib/whatsappConcierge.js): a separate check that reads
// each reply, hand-over or silence against the conversation and what's on
// file before it goes out. The second look is shown the same pet list as
// the AI: without it, on 28 Oct it read "book taco and waffle", couldn't
// see Taco on file and had the reply rewritten with a registration form
// for a dog we'd operated on. Pure, so it can be tested
// (tests/concierge-second-look.test.mjs).

export function petListText(patients = [], unregistered = false) {
  if (patients.length) return patients.map((p) => `- ${p.name} (${p.species}${p.sex && p.sex !== 'unknown' ? `, ${p.sex}` : ''})`).join('\n');
  return unregistered ? "(this number isn't linked to a client on file)" : '(none on file yet)';
}

export function secondLookPrompt({ situation, facts, petList, transcript, draft }) {
  return `You check a veterinary clinic's WhatsApp assistant before it acts.
Situation:
${situation}
This client's pets on file:
${petList}
${facts}
The assistant may: answer simple clinic questions, check availability, book, move or cancel a routine consult, video consult, spay, castration or dental, and tell the client about appointments on file. For a number that isn't a client yet it can't look anything up or book: for any booking or new pet it should send their new-client form link (send_intake_link) and say the team will confirm once it's in. It must hand to staff anything medical or symptom-related, money already paid, test results, a pet's progress or going home, emergencies, photos or files, and anything it isn't sure about.

Conversation (oldest first):
${transcript}

What the assistant is about to do:
${draft}

Send it back only if it clearly falls short: it doesn't answer what the client actually asked; it contradicts what's on file or the situation; it repeats what the client was already told; it says "shortly" or "soon" (at night nobody is there; in the day the team may be with patients for an hour or two); it adds the 24-hour vet line when nothing suggests the pet is unwell; it hands to staff something it could do itself (e.g. what an appointment on file is, or moving a consult); someone not yet a client wants to book or register a pet, or a client's pet isn't in their pets on file above, and isn't given the registration form link (a pet in that list is on file: never send it the form); it says the team will send or check something that one of the links on file already gives them (an update on a pet staying with us, an invoice or report, a way to pay) instead of sending that link; it answers something that must go to staff; or it stays silent when the client asked or needs something. Don't send it back for style.

Respond with EXACTLY one line:
OK
or
FIX: <one or two sentences telling the assistant what to do instead>`;
}
