// lib/socialDutyRules.js
// The rules for the daily Social post duty (lib/socialDuty.js, migration
// 205): who gets today's turn, which idea they get, and what the app does
// at each point in the day. Pure, so it can be tested
// (tests/social-duty.test.mjs).

// Everyone posts except drivers and cleaners.
export const DUTY_ROLES = ['vet', 'tech', 'reception', 'admin'];

// Who gets today's turn: someone working today (on the roster), whoever has
// gone longest since their last turn (never had one = longest), ties by
// name so it's predictable. If nobody eligible is rostered, anyone eligible.
// staff: [{ id, full_name, role, active }]; rosteredIds: Set of staff ids;
// lastTurn: Map staff id -> 'YYYY-MM-DD' of their latest duty.
export function pickDutyStaff(staff, rosteredIds, lastTurn, exclude = []) {
  const eligible = staff.filter((s) => s.active !== false && DUTY_ROLES.includes(s.role) && !exclude.includes(s.id));
  const working = eligible.filter((s) => rosteredIds.has(s.id));
  const pool = working.length ? working : eligible;
  if (!pool.length) return null;
  return [...pool].sort((a, b) => {
    const la = lastTurn.get(a.id) || '';
    const lb = lastTurn.get(b.id) || '';
    if (la !== lb) return la < lb ? -1 : 1;
    return String(a.full_name || '').localeCompare(String(b.full_name || ''));
  })[0];
}

// Ideas for a day the week's plan has nothing left for: always doable with
// a phone in a couple of minutes.
export const FALLBACK_IDEAS = [
  { title: 'A happy patient going home', format: 'reel', shots: ['The pet walking out of the clinic or into the carrier, 5 seconds, with the owner\'s OK', 'A close-up of their face, 3 seconds'] },
  { title: 'Behind the scenes: morning rounds', format: 'reel', shots: ['The ward from the door as the lights go on, 4 seconds', 'Hands checking a patient or filling a water bowl, 5 seconds'] },
  { title: 'Meet the team', format: 'photo', shots: ['A colleague at work, smiling, by a window', 'One line from them: what they love about the job'] },
  { title: 'Quick tip from the vets', format: 'reel', shots: ['A vet saying one useful tip to camera, 10 to 15 seconds (heat, teeth, travel, food)'] },
  { title: 'Cattery life', format: 'reel', shots: ['A cattery guest stretching, playing or eating, 5 to 8 seconds, with the owner\'s OK'] },
];

// The idea for today: the plan's idea for this weekday if it's not done
// yet, else the plan's first idea not done, else a fallback in turn.
// plan: { week_start, ideas: [{ day, ... }] } or null; doneIdx: Set of idea
// indexes already posted; weekday: 'Monday'...; dayNumber: for rotating
// the fallbacks.
export function pickDutyIdea(plan, doneIdx, weekday, dayNumber) {
  const ideas = plan?.ideas || [];
  const today = ideas.findIndex((idea, n) => idea.day === weekday && !doneIdx.has(n));
  const n = today !== -1 ? today : ideas.findIndex((_, i) => !doneIdx.has(i));
  if (n !== -1) return { ...ideas[n], plan_idea: `${plan.week_start}:${n}` };
  return { ...FALLBACK_IDEAS[dayNumber % FALLBACK_IDEAS.length], plan_idea: null };
}

// What to do at this UAE hour: assign in the morning, nudge at midday and
// late afternoon, tell the admin in the evening. Nothing once it's done or
// that step already happened.
export function dutyStep(hour, duty) {
  if (!duty) return hour >= 8 && hour < 19 ? 'assign' : null;
  if (duty.done_at) return null;
  if (hour >= 18 && !duty.escalated_at) return 'escalate';
  if (hour >= 16 && duty.reminders < 2) return 'remind';
  if (hour >= 12 && duty.reminders < 1) return 'remind';
  return null;
}
