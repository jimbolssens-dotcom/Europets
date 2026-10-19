// lib/socialDuty.js
// The daily Social post duty (migration 205; the rules are in
// lib/socialDutyRules.js). The sweep (app/api/social-duty/sweep, a few
// times a day) picks today's person in the morning and pushes the idea to
// their phone, nudges them at midday and late afternoon until they've made
// a post, and tells the admin in the evening if they still haven't. Making
// any Social post that day (upload, or 📸 Social from a WhatsApp photo)
// counts as done; approving it is a separate step.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendPushToStaff } from '@/lib/pushNotifications';
import { dubaiDateISO } from '@/lib/dayProcedureSchedule';
import { weekStartFor } from '@/lib/socialPlan';
import { DUTY_ROLES, pickDutyStaff, pickDutyIdea, dutyStep } from '@/lib/socialDutyRules';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function uaeHour(now) {
  return new Date(now + 4 * 60 * 60 * 1000).getUTCHours();
}

function firstName(staff) {
  return String(staff?.full_name || '').replace(/^dr\.?\s+/i, '').split(/\s+/)[0] || 'there';
}

export async function getTodayDuty(now = Date.now()) {
  const { data } = await supabaseAdmin
    .from('social_duties')
    .select('*, staff:staff!social_duties_staff_id_fkey(id, full_name, role)')
    .eq('duty_date', dubaiDateISO(new Date(now)))
    .maybeSingle();
  return data || null;
}

async function chooseStaff(date, exclude = []) {
  const [{ data: staff }, { data: roster }, { data: history }] = await Promise.all([
    supabaseAdmin.from('staff').select('id, full_name, role, active').in('role', DUTY_ROLES),
    supabaseAdmin.from('staff_roster_entries').select('staff_id').eq('date', date),
    supabaseAdmin.from('social_duties').select('staff_id, duty_date').order('duty_date', { ascending: false }).limit(200),
  ]);
  const lastTurn = new Map();
  for (const h of history || []) if (!lastTurn.has(h.staff_id)) lastTurn.set(h.staff_id, h.duty_date);
  return pickDutyStaff(staff || [], new Set((roster || []).map((r) => r.staff_id)), lastTurn, exclude);
}

async function chooseIdea(now) {
  const weekStart = weekStartFor(now);
  const [{ data: plan }, { data: used }] = await Promise.all([
    supabaseAdmin.from('social_plans').select('week_start, ideas').eq('week_start', weekStart).maybeSingle(),
    supabaseAdmin.from('social_posts').select('plan_idea').like('plan_idea', `${weekStart}:%`).neq('status', 'discarded'),
  ]);
  const doneIdx = new Set((used || []).map((p) => Number(String(p.plan_idea).split(':')[1])));
  const uae = new Date(now + 4 * 60 * 60 * 1000);
  return pickDutyIdea(plan, doneIdx, WEEKDAYS[uae.getUTCDay()], Math.floor(now / 86400000));
}

function pushAssigned(staff, idea) {
  return sendPushToStaff(staff.id, {
    title: `📸 Today's post is yours, ${firstName(staff)}`,
    body: `${idea.title}. Two minutes with your phone, the AI writes it. Tap to start.`,
    url: '/social/new?duty=today',
  });
}

async function assign(now, exclude = [], passedFrom = null) {
  const date = dubaiDateISO(new Date(now));
  const staff = await chooseStaff(date, exclude);
  if (!staff) return { error: 'Nobody eligible to post today' };
  const idea = await chooseIdea(now);
  const { data, error } = await supabaseAdmin
    .from('social_duties')
    .upsert({ duty_date: date, staff_id: staff.id, idea, reminders: 0, last_reminded_at: null, escalated_at: null, passed_from: passedFrom })
    .select()
    .single();
  if (error) return { error: error.message };
  await pushAssigned(staff, idea).catch(() => {});
  return { data, staff };
}

// The few-times-a-day sweep: does whatever step is due right now.
export async function runDutySweep(now = Date.now()) {
  const duty = await getTodayDuty(now);
  const step = dutyStep(uaeHour(now), duty);
  if (!step) return { step: 'nothing to do' };

  if (step === 'assign') {
    const result = await assign(now);
    return { step, assigned: result.staff?.full_name || null, error: result.error };
  }

  if (step === 'remind') {
    const late = duty.reminders >= 1;
    await sendPushToStaff(duty.staff_id, {
      title: late ? `⏰ Still time for today's post, ${firstName(duty.staff)}` : `📸 Don't forget today's post, ${firstName(duty.staff)}`,
      body: `${duty.idea?.title || 'Any real moment from today'}. A photo or a 10 second clip is enough.`,
      url: '/social/new?duty=today',
    }).catch(() => {});
    await supabaseAdmin
      .from('social_duties')
      .update({ reminders: duty.reminders + 1, last_reminded_at: new Date(now).toISOString() })
      .eq('duty_date', duty.duty_date);
    return { step, reminder: duty.reminders + 1 };
  }

  // escalate: the admin hears that today's post didn't happen.
  const { data: admins } = await supabaseAdmin.from('staff').select('id').eq('role', 'admin').eq('active', true);
  for (const a of admins || []) {
    await sendPushToStaff(a.id, {
      title: "📸 Today's post hasn't been made",
      body: `${duty.staff?.full_name || 'Today\'s person'} hasn't posted yet (${duty.idea?.title || 'no idea picked'}).`,
      url: '/social',
    }).catch(() => {});
  }
  await supabaseAdmin.from('social_duties').update({ escalated_at: new Date(now).toISOString() }).eq('duty_date', duty.duty_date);
  return { step, told: (admins || []).length };
}

// "Pass it on" (someone's off sick or in surgery all day): today's turn goes
// to the next person, and the one who passed keeps their place in line.
export async function passTodayDuty(now = Date.now()) {
  const duty = await getTodayDuty(now);
  if (!duty) return assign(now);
  if (duty.done_at) return { error: "Today's post is already done" };
  // The row now names the new person, so the one who passed hasn't had a
  // turn on record and stays first in line for the next one.
  return assign(now, [duty.staff_id], duty.staff_id);
}

// Called whenever a Social post is made: if it's today's duty person, the
// duty is done.
export async function markDutyDone(staffId, postId, now = Date.now()) {
  if (!staffId || !postId) return;
  try {
    await supabaseAdmin
      .from('social_duties')
      .update({ post_id: postId, done_at: new Date(now).toISOString() })
      .eq('duty_date', dubaiDateISO(new Date(now)))
      .eq('staff_id', staffId)
      .is('done_at', null);
  } catch (err) {
    console.error('Failed to mark the Social duty done', staffId, err);
  }
}
