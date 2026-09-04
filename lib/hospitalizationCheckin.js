// lib/hospitalizationCheckin.js
// Shared config for the simplified "Quick Check-In" cleaner form
// (app/mobile/hospitalization/[id]/checkin/page.js — big icon tiles, one
// tap per category) and for rendering whichever of these fields a
// hospitalization_notes row has set, on both the staff worksheet
// (app/(admin)/hospitalization/[id]) and the client portal
// (app/portal/hospitalization/[id]) — see app/_components/CheckinSummary.jsx.
//
// appetite reuses the exact values the vet worksheet's own Appetite select
// already writes ('good'/'reduced'/'none'), so a check-in and a full
// worksheet entry agree on what "ate well" means. Every other category is
// new (migration 046).

export const CHECKIN_CATEGORIES = [
  {
    key: 'appetite',
    label: 'Appetite',
    options: [
      { value: 'good', icon: '🍖', label: 'Ate Well' },
      { value: 'reduced', icon: '🍽️', label: 'A Bit' },
      { value: 'none', icon: '🚫', label: 'Not Eating' },
    ],
  },
  {
    key: 'drinking',
    label: 'Drinking',
    options: [
      { value: 'good', icon: '💧', label: 'Drank Well' },
      { value: 'reduced', icon: '🥤', label: 'A Bit' },
      { value: 'none', icon: '🚱', label: 'Not Drinking' },
    ],
  },
  {
    key: 'stool',
    label: 'Stools',
    options: [
      { value: 'normal', icon: '💩', label: 'Normal' },
      { value: 'diarrhea', icon: '🌊', label: 'Diarrhea' },
      { value: 'bloody', icon: '🩸', label: 'Bloody' },
    ],
  },
  {
    key: 'urine',
    label: 'Urine',
    options: [
      { value: 'normal', icon: '💛', label: 'Normal' },
      { value: 'orange', icon: '🟠', label: 'Orange' },
      { value: 'pale', icon: '⚪', label: 'Pale' },
      { value: 'bloody', icon: '🩸', label: 'Bloody' },
    ],
  },
  {
    key: 'vomit',
    label: 'Vomit',
    options: [
      { value: 'none', icon: '✅', label: 'None' },
      { value: 'once', icon: '🤢', label: 'Once' },
      { value: 'multiple', icon: '🤮', label: 'Multiple Times' },
    ],
  },
  {
    key: 'mood',
    label: 'Happiness',
    options: [
      { value: 'happy', icon: '😊', label: 'Happy' },
      { value: 'neutral', icon: '😐', label: 'Neutral' },
      { value: 'unhappy', icon: '😟', label: 'Unhappy' },
    ],
  },
  {
    key: 'temperature_feel',
    label: 'Temperature',
    options: [
      { value: 'normal', icon: '🌡️', label: 'Normal' },
      { value: 'warm', icon: '🥵', label: 'Feels Warm' },
      { value: 'cold', icon: '🥶', label: 'Feels Cold' },
    ],
  },
];

export function checkinOption(key, value) {
  if (!value) return null;
  const category = CHECKIN_CATEGORIES.find((c) => c.key === key);
  return category?.options.find((o) => o.value === value) || null;
}

// Whether a note carries any Quick Check-In field — used to decide whether
// to render the icon chips (staff, via CheckinSummary) or the empathic
// prose version (owners, via buildEmpathicCheckinText) for that entry.
const CHECKIN_ONLY_KEYS = ['drinking', 'stool', 'urine', 'vomit', 'mood', 'temperature_feel'];

export function hasCheckinData(note) {
  return CHECKIN_ONLY_KEYS.some((key) => note?.[key]);
}

// Owners reading the client portal shouldn't have to decode icon chips —
// this turns a Quick Check-In entry (or any note carrying those fields)
// into a couple of warm, plain-English sentences instead. Only mentions
// what was actually recorded; concerning findings (blood in stool/urine)
// get a reassuring "the team is keeping an eye on it" note rather than
// being left to sound alarming on their own.

const APPETITE_PHRASES = {
  good: 'ate well',
  reduced: 'ate a little less than usual',
  none: "didn't eat much",
};

const DRINKING_PHRASES = {
  good: 'drank well',
  reduced: 'drank a little less than usual',
  none: "didn't drink much",
};

const STOOL_PHRASES = {
  normal: 'stools were normal',
  diarrhea: 'had a bit of diarrhea',
  bloody: 'there was a little blood in the stool, which the team is keeping a close eye on',
};

const URINE_PHRASES = {
  normal: 'urine looked normal',
  orange: 'urine looked a little orange',
  pale: 'urine looked a little pale',
  bloody: 'there was a little blood in the urine, which the team is keeping a close eye on',
};

const VOMIT_PHRASES = {
  none: 'no vomiting',
  once: 'vomited once',
  multiple: 'vomited a few times',
};

const MOOD_PHRASES = {
  happy: 'in good spirits',
  neutral: 'resting calmly',
  unhappy: 'seeming a little down',
};

const TEMPERATURE_FEEL_PHRASES = {
  normal: 'felt normal to the touch',
  warm: 'felt a little warm',
  cold: 'felt a little cool',
};

function joinWithAnd(items) {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

export function buildEmpathicCheckinText(note, patientName) {
  const name = patientName || 'Your pet';
  const sentences = [];

  const eatingDrinking = [
    APPETITE_PHRASES[note?.appetite],
    DRINKING_PHRASES[note?.drinking],
  ].filter(Boolean);
  if (eatingDrinking.length > 0) {
    sentences.push(`${name} ${joinWithAnd(eatingDrinking)} today.`);
  }

  const bathroom = [
    STOOL_PHRASES[note?.stool],
    URINE_PHRASES[note?.urine],
    VOMIT_PHRASES[note?.vomit],
  ].filter(Boolean);
  if (bathroom.length > 0) {
    sentences.push(`${capitalize(joinWithAnd(bathroom))}.`);
  }

  if (MOOD_PHRASES[note?.mood]) {
    sentences.push(`${name} has been ${MOOD_PHRASES[note.mood]}.`);
  }

  if (note?.temperature_c != null) {
    sentences.push(`Temperature was ${note.temperature_c}°C.`);
  } else if (TEMPERATURE_FEEL_PHRASES[note?.temperature_feel]) {
    sentences.push(`${name} ${TEMPERATURE_FEEL_PHRASES[note.temperature_feel]}.`);
  }

  return sentences.join(' ');
}
