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
