// lib/socialDraft.js
// The AI half of the Social page (app/(admin)/social, migration 202): it
// looks at the photos staff uploaded (a still frame for a video), reads the
// one line they wrote and, when a patient is picked, the pet's basics and
// recent visit, and drafts an Instagram and a Facebook caption in the
// clinic's own voice. It also picks the cover and flags any photo that
// shouldn't go out (a screen or paperwork with client details, a person who
// didn't agree, a blurry shot, anything distressing).
//
// It learns the voice from the captions staff actually approved: the most
// recent approved or posted ones go into the prompt as examples, so their
// edits shape the next draft.

import { z } from 'zod/v4';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { anthropic } from '@/lib/anthropicClient';
import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { SOCIAL_SYSTEM_PROMPT, buildDraftText } from '@/lib/socialDraftPrompt';

const MODEL = 'claude-opus-5';
const MAX_IMAGES = 10;
const VOICE_EXAMPLES = 6;

const DraftSchema = z.object({
  title: z.string().describe('2 to 5 words, for the staff list.'),
  caption_instagram: z.string(),
  caption_facebook: z.string(),
  cover_index: z.number().int().describe('0-based index of the image to use first.'),
  exclude: z
    .array(z.object({ index: z.number().int(), reason: z.string() }))
    .describe('Images that must not be posted, with a short reason. Empty when all are fine.'),
  notes: z.string().describe('One or two short sentences to the staff member about the choices made.'),
});

export function publicUrl(path) {
  return supabase.storage.from('consult-files').getPublicUrl(path).data.publicUrl;
}

// Runs the AI on one post and saves the draft. Returns the updated row, or
// { error } (also saved on the post as ai_error, so the page can show it).
export async function draftSocialPost(postId) {
  const { data: post, error } = await supabaseAdmin.from('social_posts').select('*').eq('id', postId).single();
  if (error || !post) return { error: 'post not found', status: 404 };

  const media = Array.isArray(post.media) ? post.media : [];
  if (media.length === 0) return { error: 'Add at least one photo or video first', status: 400 };

  let patient = null;
  let recentVisit = null;
  let recentStay = null;
  if (post.patient_id) {
    const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const [p, v, h] = await Promise.all([
      supabase.from('patients').select('name, species, breed, sex, date_of_birth').eq('id', post.patient_id).maybeSingle(),
      supabase
        .from('visits')
        .select('created_at, diagnosis, treatment_notes')
        .eq('patient_id', post.patient_id)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('hospitalizations')
        .select('admitted_at, discharged_at, reason')
        .eq('patient_id', post.patient_id)
        .gte('admitted_at', since)
        .order('admitted_at', { ascending: false })
        .limit(1),
    ]);
    patient = p.data || null;
    recentVisit = v.data?.[0] || null;
    recentStay = h.data?.[0] || null;
  }

  const { data: approved } = await supabaseAdmin
    .from('social_posts')
    .select('caption_instagram')
    .in('status', ['approved', 'posted'])
    .not('caption_instagram', 'is', null)
    .neq('id', postId)
    .order('approved_at', { ascending: false })
    .limit(VOICE_EXAMPLES);
  const examples = (approved || []).map((r) => r.caption_instagram).filter(Boolean);

  // A video goes to the AI as its still frame (the AI can't watch video), so
  // one whose frame couldn't be grabbed in the browser is left out of what
  // it sees. Indexes below are into this list.
  const shownIdx = media.map((m, i) => i).filter((i) => media[i].kind === 'image' || media[i].preview_path).slice(0, MAX_IMAGES);
  if (shownIdx.length === 0) return { error: 'The AI needs at least one photo (or a video it could take a still from)', status: 400 };
  const shown = shownIdx.map((i) => media[i]);
  const content = [];
  shown.forEach((m, i) => {
    content.push({ type: 'text', text: `Image ${i}:` });
    content.push({ type: 'image', source: { type: 'url', url: publicUrl(m.preview_path || m.path) } });
  });
  content.push({
    type: 'text',
    text: buildDraftText({
      story: post.story,
      patient,
      recentVisit,
      recentStay,
      mediaKinds: shown.map((m) => m.kind),
      examples,
    }),
  });

  let draft;
  try {
    const message = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 2048,
      system: SOCIAL_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
      output_config: { format: zodOutputFormat(DraftSchema), effort: 'medium' },
    });
    draft = message.parsed_output;
    if (!draft) throw new Error('The AI did not return a draft');
  } catch (err) {
    const message = err?.message || String(err);
    await supabaseAdmin.from('social_posts').update({ ai_error: message, updated_at: new Date().toISOString() }).eq('id', postId);
    return { error: `The AI couldn't draft this one: ${message}`, status: 502 };
  }

  const excluded = new Map((draft.exclude || []).filter((e) => shownIdx[e.index] !== undefined).map((e) => [shownIdx[e.index], e.reason]));
  const nextMedia = media.map((m, i) => ({ ...m, excluded: excluded.has(i), note: excluded.get(i) || null }));
  let cover = shownIdx[draft.cover_index] ?? shownIdx[0];
  if (nextMedia[cover]?.excluded) cover = Math.max(0, nextMedia.findIndex((m) => !m.excluded));

  const { data: updated, error: saveError } = await supabaseAdmin
    .from('social_posts')
    .update({
      status: post.status === 'new' ? 'draft' : post.status,
      title: draft.title,
      caption_instagram: draft.caption_instagram,
      caption_facebook: draft.caption_facebook,
      ai_caption_instagram: draft.caption_instagram,
      ai_caption_facebook: draft.caption_facebook,
      ai_notes: draft.notes,
      ai_error: null,
      cover_index: cover,
      media: nextMedia,
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId)
    .select()
    .single();
  if (saveError) return { error: saveError.message, status: 500 };
  return { data: updated };
}
