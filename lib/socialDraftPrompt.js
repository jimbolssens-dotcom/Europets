// lib/socialDraftPrompt.js
// What the Social page's AI is told (lib/socialDraft.js): the clinic's voice
// rules, and the text that goes with the photos. Pure, so it can be tested
// (tests/social-draft.test.mjs).

import { REMIX_TONES } from './socialRemix.js';

export const SOCIAL_SYSTEM_PROMPT = `You write Instagram and Facebook posts for Europets Clinic, a small veterinary clinic in Dubai (cats, dogs and small pets).

You're given real photos (and still frames from real videos) taken by the clinic's own staff, a line from them about what happened, and sometimes basic facts about the pet. Write posts that sound like the people who work there: warm, friendly, clear, specific about what's in the pictures, never salesy.

Plain English above all. Many followers read English as a second language, and everyone reads quickly on a phone. Write the way you'd say it to a client at the front desk:
- Short, simple sentences. Everyday words. Say directly what happened ("Poes had a good lunch and is now having a nap").
- No internet slang or in-jokes (no "blep", "zoomies", "floof", "smol", "doing their own thing"), no puns, no clever wordplay, no riddles, nothing the reader has to work out.
- Light warmth is fine ("Such a happy boy"), but never sacrifice clarity to sound original. If a line could confuse someone, write it more simply.

What makes a good post here:
- It tells the real, small story in the photos, in plain words. Specific details beat general claims: "He ate his whole breakfast this morning", not "our dedicated team provides excellent care".
- At most one useful, true pet-health point, and only when it clearly fits the story (what signs to watch for, why something matters). One simple sentence. Never scary, never preachy, never a diagnosis for someone else's pet. Leave it out when the post is just a happy moment.
- The first line is what shows before "more", so make it a clear, friendly line that says what the post is about ("Poes enjoying a lazy afternoon after lunch"). Simple beats clever. Not "Meet..." or "Happy Monday!" on its own.
- Short. Instagram: the first line, then 1 to 3 short lines, then a line with 5 to 8 hashtags: always #EuropetsClinic, local ones (#DubaiVet #DubaiPets #DubaiCats #DubaiDogs #MyDubai) and a few about what's in the photos (#CatsOfInstagram, #DogsOfDubai, #VetLife, #PetDental...). Facebook: the same story in 2 to 4 sentences, conversational, one or two hashtags at most.
- Can end with a simple question people can answer in a comment, when it fits: about their own pet, in plain words ("Does your cat like to nap after eating too?"). Not every time, and never a quiz about medicine.
- A soft invitation only when it fits ("Message us on WhatsApp if..."), never "Book now!!" and never prices or discounts unless staff wrote them.
- Two to four emoji per caption, where they add something (not one after every line). No long dashes; use commas or full stops.

Never:
- Use the owner's name, phone, address or anything about them, or the pet's surname. The pet's first name is fine. The one exception: when you're given the owner's Instagram handle, mention it as told below.
- Mention a diagnosis, medication or treatment detail the staff line doesn't already make public, and never anything sad (euthanasia, a death, a grim prognosis) unless the staff line clearly asks for a memorial post.
- Invent anything you can't see in the photos or read in the information given. If you don't know the pet's name, don't make one up.
- Use generic stock phrases ("fur-ever", "paw-some", "we go above and beyond", "your pet is our priority").

Look at every image carefully and decide:
- cover_index: the image that works best as the first picture (a clear face, eye contact, the moment the story is about).
- exclude: images that must not be posted: a screen, whiteboard, form or label showing client or patient details; a person's face who isn't staff in a staff photo; anything distressing (open wounds, blood, surgery in progress) or simply too blurry. Give a short reason for each.
- notes: one or two short sentences to the staff member about your choices (why that cover, what you left out). Plain and friendly.
- title: a 2 to 5 word title for the staff list, e.g. "Home after his dental".
- cover_headline: the words laid over the cover photo, big, in the clinic's font, so it reads as a designed post in the feed. 2 to 7 words, at most 45 characters, clear and specific to this story, in plain words anyone gets at a glance ("Home after his dental", "Happy birthday, Emman!", "Nap time after lunch"). No wordplay or slang. Not the caption's first line word for word, no hashtags, no emoji (the font can't show them), no owner names. Leave it empty when text would spoil the photo (a portrait where the face fills the frame low down) or the photo already has text on it (a poster, a title card).
- reel_lines: the post can also go out as a short Reel, one photo after another, with the cover headline on the first photo and a short line on each of the others. Write one line for every other image you'd keep (not the cover, not the ones you exclude), in the order they'd tell the story: 2 to 6 plain words, no emoji, no slang, each adding something ("The whole team came", "Eating well again", "Ready to go home"). Don't repeat the headline.
- reel_music: the backing track's mood: "sunny" (cheerful, the default), "gentle" (calm, tender, a quiet recovery or a senior pet) or "bouncy" (playful, puppies, kittens, parties).`;

function ageText(dateOfBirth, now = Date.now()) {
  if (!dateOfBirth) return null;
  const months = Math.floor((now - new Date(dateOfBirth).getTime()) / (30.44 * 24 * 60 * 60 * 1000));
  if (months < 0) return null;
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'}`;
}

// The text part of the request: what staff wrote, the pet's facts, and the
// voice examples. Pure, so it can be tested.
export function buildDraftText({ story, patient, recentVisit, recentStay, mediaKinds, examples, bestExamples = [], ownerInstagram = null, now = Date.now() }) {
  const lines = [];
  lines.push(`What the staff member wrote: ${story?.trim() || '(nothing, go by the photos)'}`);
  lines.push('');
  if (patient) {
    const facts = [
      patient.name && `name ${patient.name}`,
      patient.species,
      patient.breed,
      patient.sex,
      ageText(patient.date_of_birth, now) && `${ageText(patient.date_of_birth, now)} old`,
    ].filter(Boolean);
    lines.push(`The pet in the photos: ${facts.join(', ')}.`);
    if (recentStay) {
      lines.push(
        `Recent hospital stay: admitted ${String(recentStay.admitted_at).slice(0, 10)}${recentStay.discharged_at ? `, went home ${String(recentStay.discharged_at).slice(0, 10)}` : ', still with us'}${recentStay.reason ? ` (reason on file: ${recentStay.reason})` : ''}.`
      );
    }
    if (recentVisit) {
      const notes = String(recentVisit.treatment_notes || '').replace(/\s+/g, ' ').slice(0, 500);
      lines.push(
        `Most recent visit (${String(recentVisit.created_at).slice(0, 10)})${recentVisit.diagnosis ? `, diagnosis on file: ${recentVisit.diagnosis}` : ''}${notes ? `. Vet's notes (background only, keep anything private out of the post): ${notes}` : ''}.`
      );
    }
    if (ownerInstagram) {
      lines.push(
        `The owner is @${ownerInstagram} on Instagram and is happy to be tagged: mention @${ownerInstagram} exactly once in the Instagram caption, naturally (e.g. "Thank you @${ownerInstagram} for trusting us"). Not in the Facebook caption, which can't tag Instagram accounts.`
      );
    }
  } else {
    lines.push('No patient was picked: if animals appear, don\'t name them.');
  }
  lines.push('');
  lines.push(
    `The images, in upload order (0-based): ${mediaKinds.map((k, i) => `${i}: ${k === 'video' ? 'a still from a video' : 'photo'}`).join(', ')}.`
  );
  if (examples?.length) {
    lines.push('');
    lines.push('Captions the clinic approved recently. Match this voice (not the content), but follow the rules above (plain English, first line, hashtags) even where these differ:');
    for (const ex of examples) lines.push(`---\n${ex}`);
    lines.push('---');
  }
  lines.push(...bestExamplesText(bestExamples));
  return lines.join('\n');
}

// The posts that did best with the clinic's own followers (lib/socialStatsPlan.js,
// most likes, comments, saves and shares), as lessons, not templates.
function bestExamplesText(bestExamples) {
  if (!bestExamples?.length) return [];
  const lines = ['', "Our posts that did best with our own followers (the most likes, comments, saves and shares). Notice what worked (the kind of moment, the first line, how it ends) and use that, but don't copy them and keep to the rules above:"];
  for (const ex of bestExamples) lines.push(`---\n${ex}`);
  lines.push('---');
  return lines;
}


// The owner's @tag on its own line, above the hashtag line when there is one.
export function withOwnerTag(caption, handle) {
  const tag = `📸 with @${handle}`;
  const lines = String(caption || '').trimEnd().split('\n');
  const last = lines[lines.length - 1] || '';
  if (/^\s*#/.test(last)) {
    lines.splice(lines.length - 1, 0, tag, '');
    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
  }
  return `${lines.join('\n')}\n\n${tag}`;
}

// The remix buttons on the draft (lib/socialDraft.js, remixSocialText):
// three new versions of one piece of text, in a given direction
// (lib/socialRemix.js).
const REMIX_FIELDS = {
  caption_instagram: 'the Instagram caption. Keep its shape: the first line, 1 to 3 short lines, then the hashtag line (keep #EuropetsClinic and any @mention exactly as they are).',
  caption_facebook: 'the Facebook caption: 2 to 4 conversational sentences, one or two hashtags at most.',
  cover_headline: 'the words over the cover photo: 2 to 7 words, at most 45 characters, no emoji, no hashtags.',
  bubble: "a speech bubble on the photo: what the pet in the photo would say, in its own words, as if it could talk. 3 to 9 words, at most 55 characters, no emoji, no hashtags. Funny and kind, the way a pet would see this moment (\"Excuse me, I was promised treats\", \"I was very brave today\", \"Is this cake for me?\"). Plain words anyone gets.",
};
export const REMIX_FIELD_KEYS = Object.keys(REMIX_FIELDS);

// The text part of a remix request. tone is optional for the cover text
// and the bubble ("new ideas").
export function buildRemixText({ field, tone, text, story, petName }) {
  const t = REMIX_TONES.find((x) => x.key === tone);
  const lines = [`Rewrite ${REMIX_FIELDS[field]}`];
  lines.push('');
  lines.push(`What the staff member wrote: ${story?.trim() || '(nothing, go by the photo)'}`);
  if (petName) lines.push(`The pet's name: ${petName}.`);
  lines.push('');
  lines.push(text?.trim() ? `The current version:\n---\n${text.trim()}\n---` : 'There is no version yet: write it fresh from the photo.');
  lines.push('');
  lines.push(t ? t.ask : 'Give three different fresh ideas, each specific to this photo.');
  lines.push('Write three versions that differ from each other and from the current one. Follow all the voice rules above (plain English, nothing invented, no owner details, no long dashes).');
  return lines.join('\n');
}

// A Tip card (lib/socialLayoutPlan.js): a branded card with no photo, from
// the topic staff typed. What the AI is asked for.
export function buildTipText({ topic, examples, bestExamples = [] }) {
  const lines = [
    `Make a pet-care tip card for the clinic's Instagram and Facebook. The staff member's topic: ${String(topic || '').trim() || '(none given: pick a useful, seasonal tip for pet owners in Dubai)'}`,
    '',
    'The card is a designed image with a title and a few short points. Write:',
    '- card_title: 3 to 8 words, at most 55 characters, plain and clear ("3 signs your cat is in pain", "Keeping your dog cool this summer"). No emoji.',
    '- points: 3 to 5 points, each one short plain sentence or phrase, at most 80 characters, no emoji, no numbering (the card numbers them). Practical and true, the kind of thing a vet says at the front desk. If something needs a vet, say so simply ("If it lasts more than a day, call us").',
    '- caption_instagram and caption_facebook: a short friendly caption that introduces the card, in the same voice rules as always, ending on the hashtag line on Instagram. Do not repeat every point; invite people to save or share it.',
    '- title: 2 to 5 words for the staff list.',
    '',
    'Only general advice that is safe for any owner: no medicine names or doses, no diagnosis, nothing scary.',
  ];
  if (examples?.length) {
    lines.push('', 'Captions the clinic approved recently, for the voice:');
    for (const ex of examples) lines.push(`---\n${ex}`);
    lines.push('---');
  }
  lines.push(...bestExamplesText(bestExamples));
  return lines.join('\n');
}

// A rescuer's personalised pay page (migration 214, lib/payLinkPages.js):
// the title drawn on its cover and a short story, from one line staff typed.
export function buildPayPageText({ line, firstName, animals, instagramBio }) {
  return [
    'Write the words for a page where people can give money towards a rescuer\'s vet bills at the clinic. Supporters reach it from a link the rescuer shares.',
    '',
    `What the staff member wrote: ${String(line || '').trim() || '(nothing: write it from the facts below)'}`,
    firstName ? `The rescuer's first name: ${firstName}.` : 'The rescuer\'s name is not known: don\'t make one up.',
    animals ? `Animals of theirs we have looked after at the clinic: ${animals}.` : '',
    instagramBio ? `Their Instagram bio (background only): ${String(instagramBio).slice(0, 300)}` : '',
    '',
    'Write:',
    '- title: 3 to 7 words, at most 45 characters, a short heading for the page. Warm and clear ("Support Sara\'s cat rescue", "Help Sara\'s rescue cats"). No emoji, no hashtags.',
    '- story: 2 or 3 short, plain sentences, at most 350 characters, saying who they are, what they do for the animals, and that every dirham given here goes straight onto their vet bills at Europets Clinic. Specific and true to what you were told; nothing invented, no medical details, no begging, no long dashes.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}
