// lib/socialPlan.js
// The weekly Social plan (migration 204): 3 or 4 post ideas for the week,
// each with what to film, made by the AI from the clinic's real activity
// (the last 14 days and the coming week's bookings) and what was posted
// recently. Shown on the Social page; made on Monday morning by
// app/api/social-plan/weekly, or by staff with "Plan this week".

import { z } from 'zod/v4';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { anthropic } from '@/lib/anthropicClient';
import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { bucketKey, LAST_IMPORTED_CLIENT_NUMBER } from '@/lib/accountingCharts';
import { SOCIAL_PLAN_SYSTEM_PROMPT, buildPlanText } from '@/lib/socialPlanPrompt';

const MODEL = 'claude-opus-5';
const DAY = 24 * 60 * 60 * 1000;

const PlanSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().describe('2 to 6 words, e.g. "Breakfast in the cattery".'),
        day: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']),
        format: z.enum(['reel', 'carousel', 'photo']),
        why: z.string().describe('One short sentence: why this, this week.'),
        shots: z.array(z.string()).describe('2 to 4 specific shots to capture.'),
      })
    )
    .describe('3 or 4 ideas, in day order.'),
  notes: z.string().describe('One friendly sentence to the team about the week.'),
});

// The Monday (UAE) of the week `now` is in, as YYYY-MM-DD.
export function weekStartFor(now = Date.now()) {
  return bucketKey(now, 'week');
}

async function count(query) {
  const { count: n } = await query;
  return n || 0;
}

async function clinicActivity(now) {
  const since = new Date(now - 14 * DAY).toISOString();
  const nowIso = new Date(now).toISOString();
  const nextWeek = new Date(now + 7 * DAY).toISOString();
  const [consults, vaccinations, newClients, admissions, dayProcedures, dentals, catteryGuests, upcomingConsults, upcomingSurgeries, procedures, visitPets] =
    await Promise.all([
      count(supabase.from('visits').select('id', { count: 'exact', head: true }).gte('started_at', since)),
      count(supabase.from('vaccinations').select('id', { count: 'exact', head: true }).gte('date_given', since.slice(0, 10))),
      count(supabase.from('clients').select('id', { count: 'exact', head: true }).gte('created_at', since).gt('client_number', LAST_IMPORTED_CLIENT_NUMBER)),
      count(supabase.from('hospitalizations').select('id', { count: 'exact', head: true }).gte('admitted_at', since).neq('kind', 'day_procedure')),
      count(supabase.from('hospitalizations').select('id', { count: 'exact', head: true }).gte('admitted_at', since).eq('kind', 'day_procedure')),
      count(supabase.from('dental_reports').select('id', { count: 'exact', head: true }).gte('created_at', since)),
      count(supabase.from('cattery_bookings').select('id', { count: 'exact', head: true }).eq('status', 'checked_in')),
      count(supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('type', 'consult').gte('start_time', nowIso).lt('start_time', nextWeek)),
      count(supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('type', 'surgery').gte('start_time', nowIso).lt('start_time', nextWeek)),
      supabase.from('surgical_reports').select('procedure_name').gte('created_at', since).limit(200),
      supabase.from('visits').select('patients(species)').gte('started_at', since).limit(1000),
    ]);
  const byProcedure = new Map();
  for (const r of procedures.data || []) {
    const name = String(r.procedure_name || '').trim().toLowerCase();
    if (name) byProcedure.set(name, (byProcedure.get(name) || 0) + 1);
  }
  const species = {};
  for (const v of visitPets.data || []) {
    const s = String(v.patients?.species || '').trim().toLowerCase();
    if (s) species[s] = (species[s] || 0) + 1;
  }
  return {
    consults,
    vaccinations,
    newClients,
    admissions,
    dayProcedures,
    dentals,
    catteryGuests,
    upcomingConsults,
    upcomingSurgeries,
    topProcedures: [...byProcedure.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, c]) => `${n} (${c})`),
    species,
  };
}

// Makes (or remakes) this week's plan and saves it. Returns the row, or { error }.
export async function generateSocialPlan(now = Date.now()) {
  const weekStart = weekStartFor(now);
  const [activity, { data: recent }] = await Promise.all([
    clinicActivity(now),
    supabaseAdmin
      .from('social_posts')
      .select('title')
      .neq('status', 'discarded')
      .not('title', 'is', null)
      .gte('created_at', new Date(now - 35 * DAY).toISOString())
      .order('created_at', { ascending: false })
      .limit(20),
  ]);
  const uaeDateLabel = new Date(now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' });

  let plan;
  try {
    const message = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 2048,
      system: SOCIAL_PLAN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPlanText({ weekStart, activity, recentTitles: (recent || []).map((r) => r.title), uaeDateLabel }) }],
      output_config: { format: zodOutputFormat(PlanSchema), effort: 'medium' },
    });
    plan = message.parsed_output;
    if (!plan?.ideas?.length) throw new Error('The AI did not return a plan');
  } catch (err) {
    return { error: `Could not make the plan: ${err?.message || err}`, status: 502 };
  }

  const { data, error } = await supabaseAdmin
    .from('social_plans')
    .upsert({ week_start: weekStart, ideas: plan.ideas.slice(0, 4), notes: plan.notes, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) return { error: error.message, status: 500 };
  return { data };
}
