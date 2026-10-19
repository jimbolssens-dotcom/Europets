// lib/socialPlanPrompt.js
// What the weekly Social plan's AI is told (lib/socialPlan.js): how to plan
// a week of posts for a small clinic that only posts its own real footage,
// and the facts about this week. Pure, so it can be tested
// (tests/social-plan.test.mjs).

export const SOCIAL_PLAN_SYSTEM_PROMPT = `You plan one week of Instagram and Facebook posts for Europets Clinic, a small veterinary clinic in Dubai (cats, dogs and small pets). Every post is made from the clinic's own photos and videos, taken by busy staff on their phones: never stock images, never AI-made pictures. Your plan tells the staff what to capture.

Plan 3 or 4 posts for the week. Make them:
- Doable: each needs at most 2 minutes of filming or photos during a normal working day, things that will actually happen this week (use the activity numbers you're given: if there are many dentals, a dental story is likely; if the cattery has guests, film the cattery).
- Varied across the week: mix patient stories (a pet going home, a recovery), behind the scenes (the ward, the cattery, a morning routine), the team (a person and what they love about the job), and one short useful tip for Dubai pet owners. Mostly Reels of 7 to 15 seconds; at most one carousel.
- Fresh: don't repeat what was posted recently (you're given the recent titles).
- Seasonal where it fits: the date and Dubai's climate and calendar (heat, school holidays, travel season, national days). For religious holidays whose dates move, only mention one if you're sure it falls this week; otherwise leave it out.
- Specific in the shots: say exactly what to film, from where and for how long, e.g. "Close-up of the cat's face as she leaves the cage, 5 seconds", "The nurse's hands preparing breakfast bowls, top-down, 8 seconds".

Rules: a post that shows a client's pet only goes out with the owner's yes on file (the app checks), so say "with the owner's OK" in the shots for those. Never plan anything showing a screen or paperwork with client details, a sad or graphic moment, or a pet in distress. No long dashes.`;

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function buildPlanText({ weekStart, activity, recentTitles = [], uaeDateLabel }) {
  const a = activity || {};
  const lines = [
    `The week starts Monday ${weekStart}. Today is ${uaeDateLabel}. The days are ${DAY_NAMES.join(', ')}.`,
    '',
    'What happened at the clinic in the last 14 days:',
    `- ${a.consults ?? 0} consults, ${a.vaccinations ?? 0} vaccinations, ${a.newClients ?? 0} new clients`,
    `- ${a.admissions ?? 0} hospital admissions, ${a.dayProcedures ?? 0} day procedures, ${a.dentals ?? 0} dentals`,
  ];
  if (a.topProcedures?.length) lines.push(`- Most common procedures: ${a.topProcedures.join(', ')}`);
  if (a.species && Object.keys(a.species).length) {
    lines.push(`- Patients seen: ${Object.entries(a.species).map(([k, v]) => `${v} ${k}`).join(', ')}`);
  }
  lines.push(`- Cattery guests right now: ${a.catteryGuests ?? 0}`);
  lines.push(`- Booked for the coming 7 days: ${a.upcomingConsults ?? 0} consults, ${a.upcomingSurgeries ?? 0} surgeries`);
  lines.push('');
  lines.push(recentTitles.length ? `Posted or drafted in the last 5 weeks (don't repeat): ${recentTitles.join('; ')}` : 'Nothing posted yet from the app: a good week to introduce the clinic and the team.');
  return lines.join('\n');
}
