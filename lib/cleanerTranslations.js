// lib/cleanerTranslations.js
// Sinhala text for the cleaner-only mobile screens (cage layout, Quick
// Check-In) — the cleaning staff read Sinhala more comfortably than
// English. Gated on isCleaner (see useMobileStaff) so every other role's
// screens are untouched: t()/checkinCategoryLabel()/checkinOptionLabel()
// all just hand back the English original when isCleaner is false.
//
// This is a best-effort plain-language translation, not a professional
// medical one — worth having a Sinhala speaker sanity-check the check-in
// wording (the blood-in-stool/urine options especially) before relying on
// it for anything clinically important.

const CHROME = {
  Hospital: 'රෝහල',
  'Staff Roster': 'කාර්ය මණ්ඩල කාලසටහන',
  Hospitalization: 'රෝහල',
  'Recovery Cages': 'සුවවීමේ කූඩු',
  'Isolation Cages': 'හුදකලා කූඩු',
  'Dog Cages': 'බල්ලන්ගේ කූඩු',
  'Post-Op Cages': 'සැත්කමෙන් පසු කූඩු',
  LT: 'දිගු කාලීන',
  'Hospitalization Cages': 'රෝහල් කූඩු',
  Empty: 'හිස්',
  'Loading...': 'පූරණය වෙමින්...',
  'No cage': 'කූඩුවක් නැත',
  Temperature: 'උෂ්ණත්වය',
  'Press and hold, then drag up (warmer) or down (cooler) — optional.':
    'ඔබා අල්ලාගෙන සිටින්න — උණුසුම් නම් උඩට, සිසිල් නම් පහළට අදින්න (අවශ්‍ය නැත).',
  '✕ Clear reading': '✕ මකන්න',
  Photo: 'ඡායාරූපය',
  Remove: 'ඉවත් කරන්න',
  '📷 Photo': '📷 ඡායාරූපය',
  '📎 File': '📎 ගොනුව',
  '✅ Save': '✅ සුරකින්න',
  'Saving...': 'සුරකිමින්...',
  Done: 'අවසන්',
  '✅ Check-in logged.': '✅ සටහන් විය.',
  'Hello,': 'ආයුබෝවන්,',
  Switch: 'මාරු කරන්න',
};

export function t(text, isCleaner) {
  if (!isCleaner) return text;
  return CHROME[text] || text;
}

// Keyed by the check-in category's own key/value (see
// lib/hospitalizationCheckin.js), not by English text — several options
// share the same English word ("Normal", "Done") without always meaning
// the same thing, so a plain text lookup would risk mistranslating one of
// them (e.g. the "Done" check-in tile vs. the page's own "Done" button).
const CHECKIN_CATEGORY_LABELS = {
  appetite: 'ආහාර රුචිය',
  drinking: 'බීම',
  stool: 'මළපහ',
  urine: 'මුත්‍රා',
  vomit: 'වමනය',
  mood: 'සතුට',
  temperature_feel: 'උෂ්ණත්වය',
  medication_given: 'බෙහෙත්',
  force_feeding_done: 'බලෙන් කැවීම',
};

const CHECKIN_OPTION_LABELS = {
  'appetite:good': 'හොඳින් කෑවා',
  'appetite:reduced': 'ටිකක්',
  'appetite:none': 'කන්නේ නැත',
  'drinking:good': 'හොඳින් බීවා',
  'drinking:reduced': 'ටිකක්',
  'drinking:none': 'බොන්නේ නැත',
  'stool:normal': 'සාමාන්‍යයි',
  'stool:diarrhea': 'පාචනය',
  'stool:bloody': 'ලේ සහිතයි',
  'urine:normal': 'සාමාන්‍යයි',
  'urine:orange': 'තැඹිලි පාට',
  'urine:pale': 'සුදුමැලි',
  'urine:bloody': 'ලේ සහිතයි',
  'vomit:none': 'නැත',
  'vomit:once': 'එක් වරක්',
  'vomit:multiple': 'කිහිප වතාවක්',
  'mood:happy': 'සතුටුයි',
  'mood:neutral': 'සාමාන්‍යයි',
  'mood:unhappy': 'අසතුටුයි',
  'temperature_feel:normal': 'සාමාන්‍යයි',
  'temperature_feel:warm': 'උණුසුම් දැනේ',
  'temperature_feel:cold': 'සීතල දැනේ',
  'medication_given:given': 'දුන්නා',
  'force_feeding_done:done': 'කළා',
};

export function checkinCategoryLabel(category, isCleaner) {
  if (!isCleaner) return category.label;
  return CHECKIN_CATEGORY_LABELS[category.key] || category.label;
}

export function checkinOptionLabel(categoryKey, option, isCleaner) {
  if (!isCleaner) return option.label;
  return CHECKIN_OPTION_LABELS[`${categoryKey}:${option.value}`] || option.label;
}
