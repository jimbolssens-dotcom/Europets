// app/api/social-posts/route.js
// GET  /api/social-posts?status=draft|approved|posted -> the Social page's lists,
//      each posted post with its numbers, and the week's best post
//      (migration 212, lib/socialStatsPlan.js)
// POST /api/social-posts { story, patient_id, created_by } -> a new post to
//      upload files into (social/<id>/ in the consult-files bucket)
//
// social_posts is server-only (RLS on, migration 202), so everything here
// goes through supabaseAdmin. Behind the staff login like the rest of /api.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { publicUrl } from '@/lib/socialDraft';
import { postConsent } from '@/lib/socialPosts';
import { markDutyDone } from '@/lib/socialDuty';
import { bestPost, statsLine, statsScore } from '@/lib/socialStatsPlan';

export const dynamic = 'force-dynamic';

const LIST_STATUSES = { draft: ['new', 'draft'], approved: ['approved'], posted: ['posted'] };

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const statuses = LIST_STATUSES[searchParams.get('status')] || LIST_STATUSES.draft;
  const { data, error } = await supabaseAdmin
    .from('social_posts')
    .select('id, status, title, story, media, cover_index, layout, stats, created_at, approved_at, posted_at, patient_id, patients(name, species, clients(social_media_consent)), creator:staff!social_posts_created_by_fkey(full_name)')
    .in('status', statuses)
    .order(statuses.includes('posted') ? 'posted_at' : 'created_at', { ascending: false })
    .limit(60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const counts = {};
  for (const [key, list] of Object.entries(LIST_STATUSES)) {
    const { count } = await supabaseAdmin.from('social_posts').select('id', { count: 'exact', head: true }).in('status', list);
    counts[key] = count || 0;
  }

  // The week's best post, whichever list is open.
  const { data: week } = await supabaseAdmin
    .from('social_posts')
    .select('id, status, title, story, media, cover_index, layout, stats, posted_at')
    .eq('status', 'posted')
    .not('stats', 'is', null)
    .gte('posted_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  const top = bestPost(week || []);
  let best = null;
  if (top) {
    const media = Array.isArray(top.post.media) ? top.post.media : [];
    const cover = media[top.post.cover_index] || media[0];
    best = {
      id: top.post.id,
      title: top.post.title || top.post.story || 'Untitled',
      cover_url: cover ? publicUrl(cover.preview_path || cover.path) : null,
      tip: top.post.layout?.kind === 'tip',
      stats_line: statsLine(top.post.stats),
      score: statsScore(top.post.stats),
    };
  }

  return NextResponse.json(
    {
      counts,
      best,
      posts: data.map((p) => {
        const media = Array.isArray(p.media) ? p.media : [];
        const cover = media[p.cover_index] || media[0];
        return {
          id: p.id,
          status: p.status,
          title: p.title,
          story: p.story,
          created_at: p.created_at,
          approved_at: p.approved_at,
          posted_at: p.posted_at,
          created_by_name: p.creator?.full_name || null,
          patient_name: p.patients?.name || null,
          consent: postConsent(p),
          photo_count: media.filter((m) => m.kind === 'image' && !m.excluded).length,
          video_count: media.filter((m) => m.kind === 'video' && !m.excluded).length,
          cover_url: cover ? publicUrl(cover.preview_path || cover.path) : null,
          tip: p.layout?.kind === 'tip',
          stats_line: p.stats && (p.stats.instagram || p.stats.facebook) ? statsLine(p.stats) : null,
          stats_at: p.stats?.fetched_at || null,
        };
      }),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const patientId = body.patient_id || null;
  if (patientId) {
    const { data: patient } = await supabaseAdmin.from('patients').select('id, clients(social_media_consent)').eq('id', patientId).maybeSingle();
    if (!patient) return NextResponse.json({ error: 'That patient could not be found' }, { status: 404 });
    if (patient.clients?.social_media_consent === false) {
      return NextResponse.json({ error: "This owner said no to social media, so this pet can't be posted." }, { status: 409 });
    }
  }
  const { data, error } = await supabaseAdmin
    .from('social_posts')
    .insert([
      {
        story: String(body.story || '').trim() || null,
        patient_id: patientId,
        created_by: body.created_by || null,
        // The week's plan idea it was made for ("2026-10-19:1"), so the plan shows it done.
        plan_idea: /^\d{4}-\d{2}-\d{2}:\d$/.test(body.plan_idea || '') ? body.plan_idea : null,
      },
    ])
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Today's duty person making a post: their duty is done.
  await markDutyDone(body.created_by, data.id);
  return NextResponse.json(data, { status: 201 });
}
