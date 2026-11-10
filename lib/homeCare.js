// lib/homeCare.js
// Home care (Jim, 10 Nov): the short "what to do at home" list staff save
// on a consult, day procedure or hospital stay, shown to the owner in the
// client app as a daily checklist, plus what owners log back about their
// pets (migration 247). Pure: used by the API routes, the staff card
// (app/_components/HomeCareCard.jsx), the client app and the tests.
//
// A plan's items:
//   med   { name, dose, times_per_day, days }  ticked per dose
//   task  { text, icon, days }                 ticked once a day
//   keep  { text, icon, days }                 keep doing, no tick
//   watch { text }                             message us if

export const MAX_TIMES_PER_DAY = 4;
export const DEFAULT_MED_DAYS = 7;
export const TEMPERATURE_WARN_C = 39.5;

// The "Do at home" chips. task = a daily tick, keep = keep doing.
export const HOME_CARE_TASKS = [
  { id: 'cone', icon: '🛡️', text: 'Cone on until the recheck', kind: 'keep' },
  { id: 'check_wound', icon: '🔍', text: 'Check the wound', kind: 'task' },
  { id: 'no_bath', icon: '🚫', text: 'No bathing or swimming', kind: 'keep' },
  { id: 'indoors', icon: '🏠', text: 'Keep indoors', kind: 'keep', days: 7 },
  { id: 'wet_food', icon: '🥣', text: 'Wet food only', kind: 'keep' },
  { id: 'soft_food', icon: '🥄', text: 'Soft food only', kind: 'keep', days: 7 },
  { id: 'restrict', icon: '🦴', text: 'Restrict exercise, lead walks only', kind: 'keep', days: 14 },
  { id: 'temperature', icon: '🌡️', text: 'Take the temperature', kind: 'task' },
  { id: 'weigh', icon: '⚖️', text: 'Weigh', kind: 'task' },
  { id: 'water', icon: '💧', text: 'Make sure there is fresh water', kind: 'keep' },
];

// "Message us if" chips.
export const HOME_CARE_WATCH = [
  { id: 'not_eating', text: 'Not eating for over a day' },
  { id: 'wound', text: 'Wound swollen, red or wet' },
  { id: 'vomiting', text: 'Vomiting' },
  { id: 'diarrhoea', text: 'Diarrhoea' },
  { id: 'breathing', text: 'Breathing fast or with effort' },
  { id: 'lethargic', text: 'Very quiet or weak' },
  { id: 'urine', text: 'Straining to pee or no pee' },
];

// One tap for a routine case.
export const HOME_CARE_TEMPLATES = [
  { id: 'castration', label: 'Castration', tasks: ['cone', 'check_wound', 'indoors', 'no_bath', 'restrict'], watch: ['wound', 'not_eating', 'lethargic'], days: 10 },
  { id: 'spay', label: 'Spay', tasks: ['cone', 'check_wound', 'indoors', 'no_bath', 'restrict'], watch: ['wound', 'not_eating', 'vomiting', 'lethargic'], days: 10 },
  { id: 'dental', label: 'Dental', tasks: ['soft_food'], watch: ['not_eating', 'lethargic'], days: 7 },
  { id: 'wound', label: 'Wound / abscess', tasks: ['cone', 'check_wound', 'no_bath'], watch: ['wound', 'not_eating', 'lethargic'], days: 7 },
];

export function newKey() {
  return Math.random().toString(36).slice(2, 10);
}

export function taskItem(id, days) {
  const t = HOME_CARE_TASKS.find((x) => x.id === id);
  if (!t) return null;
  return { key: `t_${id}`, kind: t.kind, icon: t.icon, text: t.text, days: days ?? t.days ?? null };
}

export function watchItem(id) {
  const w = HOME_CARE_WATCH.find((x) => x.id === id);
  return w ? { key: `w_${id}`, kind: 'watch', text: w.text } : null;
}

// Template items, without doubling ones already in the plan.
export function applyTemplate(items, templateId) {
  const tpl = HOME_CARE_TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) return items;
  const have = new Set((items || []).map((i) => i.key));
  const add = [
    ...tpl.tasks.map((id) => taskItem(id, HOME_CARE_TASKS.find((t) => t.id === id)?.days ?? tpl.days)),
    ...tpl.watch.map(watchItem),
  ].filter((i) => i && !have.has(i.key));
  return [...(items || []), ...add];
}

// How often and for how long, read from a label's instructions
// ("0.3 ml by mouth twice daily for 5 days").
export function timesPerDayFromText(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(four times|4\s*x|4 times|qid|every 6 ?h)/.test(t)) return 4;
  if (/\b(three times|3\s*x|3 times|tid|every 8 ?h|thrice)/.test(t)) return 3;
  if (/\b(twice|two times|2\s*x|2 times|bid|every 12 ?h|morning and evening|am and pm)/.test(t)) return 2;
  if (/\b(once|one time|1\s*x|sid|every 24 ?h|daily|a day|per day)/.test(t)) return 1;
  return null;
}

export function daysFromText(text) {
  const t = String(text || '').toLowerCase();
  const m = t.match(/(?:for|x|×)\s*(\d{1,3})\s*(days?|d\b|weeks?|wks?)/) || t.match(/(\d{1,3})\s*(days?|weeks?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return /^w/.test(m[2]) ? n * 7 : n;
}

// The catalog name as an owner should read it: no stock marks or codes.
export function cleanMedName(name) {
  return String(name || '')
    .replace(/[\^*]+/g, '')
    .replace(/\s*\((per|each)[^)]*\)\s*/gi, ' ')
    .replace(/\s+-\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Dispensed treatment items (administration_method 'dispense') become the
// plan's medicines: the label's instructions as the dose line.
export function medsFromTreatmentItems(treatmentItems) {
  return (treatmentItems || [])
    .filter((t) => t.administration_method === 'dispense' && (t.goods_services?.name || t.name))
    .map((t) => {
      const instructions = (t.instructions || '').trim();
      return {
        key: `m_${t.id}`,
        kind: 'med',
        name: cleanMedName(t.goods_services?.name || t.name),
        dose: instructions,
        times_per_day: timesPerDayFromText(instructions) || 1,
        days: daysFromText(instructions) || DEFAULT_MED_DAYS,
        treatment_item_id: t.id,
      };
    });
}

// Keeps a plan's items sane before saving.
export function cleanItems(items) {
  const out = [];
  const seen = new Set();
  for (const raw of items || []) {
    if (!raw || !['med', 'task', 'keep', 'watch'].includes(raw.kind)) continue;
    const key = String(raw.key || newKey()).slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    const days = raw.days == null || raw.days === '' ? null : Math.max(1, Math.min(365, Math.round(Number(raw.days)) || 1));
    if (raw.kind === 'med') {
      const name = String(raw.name || '').trim().slice(0, 120);
      if (!name) continue;
      out.push({
        key, kind: 'med', name,
        dose: String(raw.dose || '').trim().slice(0, 200),
        times_per_day: Math.max(1, Math.min(MAX_TIMES_PER_DAY, Math.round(Number(raw.times_per_day)) || 1)),
        days: days || DEFAULT_MED_DAYS,
        ...(raw.treatment_item_id ? { treatment_item_id: raw.treatment_item_id } : {}),
      });
    } else {
      const text = String(raw.text || '').trim().slice(0, 120);
      if (!text) continue;
      out.push({ key, kind: raw.kind, text, ...(raw.icon ? { icon: String(raw.icon).slice(0, 8) } : {}), ...(raw.kind !== 'watch' ? { days } : {}) });
    }
  }
  return out;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// The last day an item runs (inclusive), or null when it has no end.
export function itemLastDay(plan, item) {
  return item.days ? addDays(plan.starts_on, item.days - 1) : null;
}

export function itemActiveOn(plan, item, day) {
  if (day < plan.starts_on) return false;
  const last = itemLastDay(plan, item);
  return !last || day <= last;
}

// The last day anything with an end runs; a plan with only open-ended
// lines runs 14 days.
export function planLastDay(plan) {
  const ends = (plan.items || []).filter((i) => i.kind !== 'watch').map((i) => itemLastDay(plan, i));
  if (ends.length === 0) return plan.starts_on;
  if (ends.some((e) => e == null)) {
    const dated = ends.filter(Boolean).sort();
    const open = addDays(plan.starts_on, 13);
    return dated.length && dated[dated.length - 1] > open ? dated[dated.length - 1] : open;
  }
  return ends.sort()[ends.length - 1];
}

export function planActiveOn(plan, day) {
  return !!plan && day >= plan.starts_on && day <= planLastDay(plan);
}

export function planDayNumber(plan, day) {
  const n = Math.round((new Date(`${day}T00:00:00Z`) - new Date(`${plan.starts_on}T00:00:00Z`)) / 86400000) + 1;
  const total = Math.round((new Date(`${planLastDay(plan)}T00:00:00Z`) - new Date(`${plan.starts_on}T00:00:00Z`)) / 86400000) + 1;
  return { day: n, total };
}

export function slotLabels(timesPerDay) {
  return [['once a day'], ['morning', 'evening'], ['morning', 'midday', 'evening'], ['morning', 'midday', 'evening', 'night']][
    Math.max(1, Math.min(4, timesPerDay || 1)) - 1
  ];
}

function tickKey(itemKey, day, slot) {
  return `${itemKey}|${day}|${slot}`;
}

// Today's checklist: one row per med and task running today, with a done
// flag per dose (slot).
export function todayChecklist(plan, logs, day) {
  if (!planActiveOn(plan, day)) return [];
  const ticked = new Set(
    (logs || []).filter((l) => l.plan_id === plan.id && (l.kind === 'dose' || l.kind === 'task')).map((l) => tickKey(l.item_key, l.for_date, l.slot ?? 0))
  );
  const rows = [];
  for (const item of plan.items || []) {
    if ((item.kind !== 'med' && item.kind !== 'task') || !itemActiveOn(plan, item, day)) continue;
    const slots = item.kind === 'med' ? item.times_per_day || 1 : 1;
    rows.push({
      item,
      slots: Array.from({ length: slots }, (_, s) => ({ slot: s, label: item.kind === 'med' ? slotLabels(slots)[s] : 'today', done: ticked.has(tickKey(item.key, day, s)) })),
      lastDay: itemLastDay(plan, item),
    });
  }
  return rows;
}

export function dosesLeft(plan, logs, day) {
  return todayChecklist(plan, logs, day).reduce((n, r) => n + r.slots.filter((s) => !s.done).length, 0);
}

// Doses and daily tasks expected on the days before today, and how many
// were ticked: "9 of 14 doses ticked, 2 missed".
export function adherence(plan, logs, today) {
  let expected = 0;
  let ticked = 0;
  const done = new Set(
    (logs || []).filter((l) => l.plan_id === plan.id && (l.kind === 'dose' || l.kind === 'task')).map((l) => tickKey(l.item_key, l.for_date, l.slot ?? 0))
  );
  const end = planLastDay(plan) < today ? planLastDay(plan) : addDays(today, -1);
  for (let day = plan.starts_on; day <= end; day = addDays(day, 1)) {
    for (const item of plan.items || []) {
      if ((item.kind !== 'med' && item.kind !== 'task') || !itemActiveOn(plan, item, day)) continue;
      const slots = item.kind === 'med' ? item.times_per_day || 1 : 1;
      for (let s = 0; s < slots; s++) {
        expected += 1;
        if (done.has(tickKey(item.key, day, s))) ticked += 1;
      }
    }
  }
  return { expected, ticked, missed: expected - ticked };
}

// What an owner can log, in the order the tiles show.
export const LOG_KINDS = [
  { kind: 'medication', icon: '💊', label: 'Medication', product: true },
  { kind: 'deworm', icon: '🪱', label: 'Dewormed', product: true },
  { kind: 'parasite', icon: '🐜', label: 'Flea / tick', product: true },
  { kind: 'supplement', icon: '🥣', label: 'Supplement', product: true },
  { kind: 'weight', icon: '⚖️', label: 'Weight', unit: 'kg' },
  { kind: 'temperature', icon: '🌡️', label: 'Temperature', unit: '°C' },
  { kind: 'eating', icon: '🍽️', label: 'Eating', choices: ['Ate well', 'Ate a little', 'Not eating'] },
  { kind: 'note', icon: '📝', label: 'Note / photo' },
];

export const PRODUCT_SUGGESTIONS = {
  deworm: ['Vermis-EX', 'Milbemax', 'Drontal', 'Profender', 'Panacur'],
  parasite: ['Revolution Plus', 'Bravecto', 'NexGard', 'NexGard Spectra', 'Advocate', 'Frontline', 'Broadline', 'Simparica', 'Credelio', 'Stronghold'],
  supplement: ['L-lysine', 'Probiotic', 'Omega-3', 'Liver support', 'Joint supplement', 'Vitamin paste'],
};

export function logKindInfo(kind) {
  if (kind === 'dose') return { icon: '💊', label: 'Dose given' };
  if (kind === 'task') return { icon: '✅', label: 'Done' };
  return LOG_KINDS.find((k) => k.kind === kind) || { icon: '📝', label: kind };
}

// Checks one owner log before saving. Returns { row } or { error }.
export function validateLog(input) {
  const kind = input?.kind;
  const info = LOG_KINDS.find((k) => k.kind === kind);
  if (!info) return { error: 'Choose what you did' };
  const row = { kind };
  const product = String(input.product || '').trim().slice(0, 120);
  const note = String(input.note || '').trim().slice(0, 1000);
  if (info.product) {
    if (!product) return { error: 'Which product?' };
    row.product = product;
  }
  if (info.unit) {
    const value = Number(String(input.value ?? '').replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return { error: `Enter the ${info.label.toLowerCase()}` };
    if (kind === 'weight' && value > 150) return { error: 'That weight looks too high, in kg' };
    if (kind === 'temperature' && (value < 30 || value > 45)) return { error: 'Enter the temperature in °C' };
    row.value = Math.round(value * 100) / 100;
  }
  if (info.choices) {
    if (!info.choices.includes(input.product)) return { error: 'Choose how it ate' };
    row.product = input.product;
  }
  if (kind === 'note' && !note && !input.photo_url) return { error: 'Write a note or add a photo' };
  if (note) row.note = note;
  if (input.photo_url) row.photo_url = String(input.photo_url).slice(0, 500);
  if (input.given_at) {
    const t = new Date(input.given_at);
    if (Number.isNaN(t.getTime()) || t.getTime() > Date.now() + 5 * 60 * 1000) return { error: 'That date is in the future' };
    row.given_at = t.toISOString();
  }
  return { row };
}

export function temperatureWarning(value) {
  return Number(value) > TEMPERATURE_WARN_C;
}

// One line for a log, as staff and owners read it.
export function logLine(log, plan) {
  const info = logKindInfo(log.kind);
  if (log.kind === 'dose' || log.kind === 'task') {
    const item = (plan?.items || []).find((i) => i.key === log.item_key);
    const what = item ? item.name || item.text : 'Home care';
    const slots = item?.kind === 'med' ? slotLabels(item.times_per_day) : null;
    return `${info.icon} ${what}${slots && slots.length > 1 ? ` · ${slots[log.slot ?? 0]}` : ''}`;
  }
  if (log.kind === 'weight') return `${info.icon} ${log.value} kg`;
  if (log.kind === 'temperature') return `${info.icon} ${log.value} °C`;
  if (log.kind === 'eating') return `${info.icon} ${log.product}`;
  if (log.kind === 'note') return `${info.icon} ${log.note || 'Photo'}`;
  return `${info.icon} ${log.product}${log.kind === 'deworm' ? ' (dewormed)' : log.kind === 'parasite' ? ' (flea / tick)' : log.kind === 'supplement' ? ' (supplement)' : ''}`;
}
