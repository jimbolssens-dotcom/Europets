// lib/rescueUpdates.js
// Daily hospital updates for a rescue partner (migration 218; the rules are
// in lib/rescueUpdatesPlan.js). Every morning the vets and techs on the
// rota get a push: one photo of each of the partner's animals in hospital
// (app/(admin)/social/rescue). The photos go into that day's one post,
// which the AI writes as a carousel (lib/socialDraft.js) and staff approve
// on the Social page as usual. It's posted with the partner invited as an
// Instagram collaborator (lib/metaSocial.js), so it shows on their profile
// too once they accept. A nudge goes at 4pm if photos are still missing.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendPushToStaff } from '@/lib/pushNotifications';
import { dubaiDateISO } from '@/lib/dayProcedureSchedule';
import { publicUrl } from '@/lib/socialDraft';
import { stayDay, rescueStep, orderCaseMedia, caseFacts } from '@/lib/rescueUpdatesPlan';

const PUSH_ROLES = ['vet', 'tech'];

function uaeHour(now) {
  return new Date(now + 4 * 60 * 60 * 1000).getUTCHours();
}

export async function activePartners() {
  const { data } = await supabaseAdmin
    .from('social_partners')
    .select('*, clients(full_name, social_media_consent)')
    .eq('active', true);
  // Posting needs their yes to social media on file.
  return (data || []).filter((p) => p.clients?.social_media_consent === true);
}

export async function getPartner(clientId) {
  return (await activePartners()).find((p) => p.client_id === clientId) || null;
}

// The partner's animals in hospital now, longest stay first.
export async function partnerCases(clientId, todayISO = dubaiDateISO()) {
  const { data } = await supabaseAdmin
    .from('hospitalizations')
    .select('id, patient_id, admitted_at, reason, patients(name, species)')
    .eq('client_id', clientId)
    .eq('status', 'admitted')
    .order('admitted_at', { ascending: true });
  return (data || []).map((h) => ({
    hospitalization_id: h.id,
    patient_id: h.patient_id,
    name: h.patients?.name || 'Rescue',
    species: h.patients?.species || null,
    reason: h.reason || null,
    day: stayDay(h.admitted_at, todayISO),
  }));
}

// Today's update post for the partner, or null.
export async function todayPost(clientId, todayISO = dubaiDateISO()) {
  const { data } = await supabaseAdmin
    .from('social_posts')
    .select('id, status, media, caption_instagram')
    .eq('partner_client_id', clientId)
    .eq('partner_date', todayISO)
    .neq('status', 'discarded')
    .maybeSingle();
  return data || null;
}

// Everything the rescue page shows for one partner today.
export async function rescueDay(partner, todayISO = dubaiDateISO()) {
  const [cases, post] = await Promise.all([partnerCases(partner.client_id, todayISO), todayPost(partner.client_id, todayISO)]);
  const media = Array.isArray(post?.media) ? post.media : [];
  return {
    client_id: partner.client_id,
    name: partner.clients?.full_name || null,
    instagram_handle: partner.instagram_handle,
    invite_collab: partner.invite_collab,
    date: todayISO,
    post: post ? { id: post.id, status: post.status, drafted: post.status !== 'new' } : null,
    cases: cases.map((c) => {
      const photo = orderCaseMedia(media, [c.patient_id])[0];
      return { ...c, photo_url: photo ? publicUrl(photo.preview_path || photo.path) : null };
    }),
  };
}

// Today's post, made if there isn't one yet.
export async function getOrCreateTodayPost(partner, staffId = null, todayISO = dubaiDateISO()) {
  const existing = await todayPost(partner.client_id, todayISO);
  if (existing) return { data: existing };
  const { data, error } = await supabaseAdmin
    .from('social_posts')
    .insert([
      {
        status: 'new',
        story: `Today's hospital update on @${partner.instagram_handle}'s rescues`,
        created_by: staffId || null,
        partner_client_id: partner.client_id,
        partner_date: todayISO,
        collaborators: partner.invite_collab ? [partner.instagram_handle] : [],
        post_as: 'photos',
      },
    ])
    .select('id, status, media, caption_instagram')
    .single();
  // Two phones starting it at once: the other one won.
  if (error?.code === '23505') return { data: await todayPost(partner.client_id, todayISO) };
  return error ? { error } : { data };
}

// Puts an uploaded photo (lib/socialUpload.js) on today's post as that
// animal's photo, replacing an earlier one, in the case list's order.
export async function setCasePhoto(postId, clientId, patientId, entry, todayISO = dubaiDateISO()) {
  const cases = await partnerCases(clientId, todayISO);
  if (!cases.some((c) => c.patient_id === patientId)) return { error: 'That animal is not in hospital for this rescue today', status: 400 };
  const { data: post } = await supabaseAdmin.from('social_posts').select('id, media, partner_client_id').eq('id', postId).single();
  if (!post || post.partner_client_id !== clientId) return { error: 'post not found', status: 404 };
  const others = (Array.isArray(post.media) ? post.media : []).filter((m) => m.patient_id !== patientId);
  const media = orderCaseMedia([...others, { ...entry, kind: 'image', patient_id: patientId, excluded: false }], cases.map((c) => c.patient_id));
  const { error } = await supabaseAdmin.from('social_posts').update({ media, cover_index: 0, updated_at: new Date().toISOString() }).eq('id', postId);
  return error ? { error: error.message, status: 500 } : { media };
}

// What the AI needs to write the post: the partner and each photo's animal.
export async function rescueUpdateContext(post) {
  if (!post?.partner_client_id) return null;
  const partner = await getPartner(post.partner_client_id);
  if (!partner) return null;
  const todayISO = post.partner_date || dubaiDateISO();
  const cases = await partnerCases(post.partner_client_id, todayISO);
  const byPatient = new Map(cases.map((c) => [c.patient_id, c]));
  // Each stay's hospital sheet: the last few days, plus the first weighing.
  const since = new Date(Date.parse(`${todayISO}T00:00:00+04:00`) - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const facts = new Map();
  await Promise.all(
    cases.map(async (c) => {
      const [{ data: recent }, { data: firstWeight }] = await Promise.all([
        supabaseAdmin
          .from('hospitalization_notes')
          .select('note_date, appetite, drinking, mood, temperature_c, weight_kg, force_feeding_done, created_at')
          .eq('hospitalization_id', c.hospitalization_id)
          .gte('note_date', since)
          .lte('note_date', todayISO)
          .order('note_date')
          .order('created_at'),
        supabaseAdmin
          .from('hospitalization_notes')
          .select('note_date, weight_kg, created_at')
          .eq('hospitalization_id', c.hospitalization_id)
          .not('weight_kg', 'is', null)
          .order('note_date')
          .order('created_at')
          .limit(1),
      ]);
      const notes = [...(firstWeight || []).filter((f) => f.note_date < since), ...(recent || [])];
      facts.set(c.patient_id, caseFacts(notes, todayISO));
    })
  );
  return {
    handle: partner.instagram_handle,
    collab: partner.invite_collab,
    animals: (post.media || [])
      .map((m) => byPatient.get(m.patient_id))
      .map((c) => (c ? { name: c.name, species: c.species, day: c.day, reason: c.reason, facts: facts.get(c.patient_id) || [] } : null)),
    in_hospital: cases.length,
  };
}

async function wardStaff(todayISO) {
  const [{ data: staff }, { data: roster }] = await Promise.all([
    supabaseAdmin.from('staff').select('id, role, active').in('role', PUSH_ROLES),
    supabaseAdmin.from('staff_roster_entries').select('staff_id').eq('date', todayISO),
  ]);
  const on = new Set((roster || []).map((r) => r.staff_id));
  return (staff || []).filter((s) => s.active !== false && on.has(s.id));
}

// Part of the Social duty sweep (8am, noon, 4pm, 6pm UAE).
export async function runRescueUpdateSweep(now = Date.now()) {
  const todayISO = dubaiDateISO(new Date(now));
  const hour = uaeHour(now);
  const done = [];
  for (const partner of await activePartners()) {
    const day = await rescueDay(partner, todayISO);
    const photos = day.cases.filter((c) => c.photo_url).length;
    const step = rescueStep(hour, { partner, todayISO, cases: day.cases.length, photos, drafted: !!day.post?.drafted });
    if (!step) continue;
    const missing = day.cases.length - photos;
    const message =
      step === 'push'
        ? { title: `📸 @${partner.instagram_handle}: ${day.cases.length} in hospital`, body: `One photo of each for today's rescue update on Instagram. Tap to start.` }
        : { title: `📸 ${missing} rescue ${missing === 1 ? 'photo' : 'photos'} still to take`, body: `For today's update on @${partner.instagram_handle}'s cases. Tap to finish.` };
    for (const s of await wardStaff(todayISO)) await sendPushToStaff(s.id, { ...message, url: '/social/rescue' }).catch(() => {});
    await supabaseAdmin.from('social_partners').update(step === 'push' ? { pushed_on: todayISO } : { nudged_on: todayISO }).eq('client_id', partner.client_id);
    done.push({ partner: partner.instagram_handle, step });
  }
  return done;
}
