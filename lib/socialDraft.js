// lib/socialDraft.js
// The AI half of the Social page (app/(admin)/social, migration 202): it
// looks at the photos staff uploaded (a still frame for a video), reads the
// one line they wrote and, when a patient is picked, the pet's basics and
// recent visit, and drafts an Instagram and a Facebook caption in the
// clinic's own voice, and a short headline to lay over the cover photo
// (lib/socialCover.js), with a line per photo and a mood of music for when
// it goes out as a Reel (lib/socialReel.js). It also picks the cover and
// flags any photo that shouldn't go out (a screen or paperwork with client
// details, a person who didn't agree, a blurry shot, anything distressing).
//
// It learns the voice from the captions staff actually approved: the most
// recent approved or posted ones go into the prompt as examples, so their
// edits shape the next draft.

import { z } from 'zod/v4';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { anthropic } from '@/lib/anthropicClient';
import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { SOCIAL_SYSTEM_PROMPT, buildDraftText, withOwnerTag, buildRemixText, REMIX_FIELD_KEYS } from '@/lib/socialDraftPrompt';
import { REMIX_TONE_KEYS } from '@/lib/socialRemix';
import { cleanHeadline } from '@/lib/socialCoverLayout';

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
  cover_headline: z.string().describe('2 to 7 words over the cover photo, no emoji; empty for none.'),
  reel_lines: z
    .array(z.object({ index: z.number().int(), line: z.string() }))
    .describe('A 2 to 6 word line for each kept image except the cover, for the Reel.'),
  reel_music: z.enum(['sunny', 'gentle', 'bouncy']),
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
  let ownerInstagram = null;
  if (post.patient_id) {
    const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const [p, v, h] = await Promise.all([
      supabase.from('patients').select('name, species, breed, sex, date_of_birth, clients(social_media_consent, instagram_handle)').eq('id', post.patient_id).maybeSingle(),
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
    // Tagged only with their yes to social media on file.
    if (patient?.clients?.social_media_consent === true) ownerInstagram = patient.clients.instagram_handle || null;
    if (patient) delete patient.clients;
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
      ownerInstagram,
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

  // The owner's tag is the point of asking for their handle: if the AI left
  // it out, add it on its own line above the hashtags.
  if (ownerInstagram && !draft.caption_instagram.toLowerCase().includes(`@${ownerInstagram}`)) {
    draft.caption_instagram = withOwnerTag(draft.caption_instagram, ownerInstagram);
  }

  const excluded = new Map((draft.exclude || []).filter((e) => shownIdx[e.index] !== undefined).map((e) => [shownIdx[e.index], e.reason]));
  const nextMedia = media.map((m, i) => ({ ...m, excluded: excluded.has(i), note: excluded.get(i) || null }));
  let cover = shownIdx[draft.cover_index] ?? shownIdx[0];
  if (nextMedia[cover]?.excluded) cover = Math.max(0, nextMedia.findIndex((m) => !m.excluded));

  // No headline on a video cover: it goes out as it is (lib/metaSocial.js).
  const headline = nextMedia[cover]?.kind === 'image' ? cleanHeadline(draft.cover_headline) : '';
  // The Reel's lines, by media index (lib/socialReelPlan.js).
  const reelLines = media.map(() => null);
  for (const r of draft.reel_lines || []) {
    const i = shownIdx[r.index];
    if (i !== undefined && i !== cover && !excluded.has(i)) reelLines[i] = cleanHeadline(r.line) || null;
  }

  const { data: updated, error: saveError } = await supabaseAdmin
    .from('social_posts')
    .update({
      status: post.status === 'new' ? 'draft' : post.status,
      title: draft.title,
      caption_instagram: draft.caption_instagram,
      caption_facebook: draft.caption_facebook,
      ai_caption_instagram: draft.caption_instagram,
      ai_caption_facebook: draft.caption_facebook,
      cover_headline: headline || null,
      ai_cover_headline: headline || null,
      reel_lines: reelLines,
      ai_reel_lines: reelLines,
      reel_music: draft.reel_music || 'sunny',
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

const RemixSchema = z.object({ options: z.array(z.string()).describe('Exactly three versions.') });

// The remix buttons on the draft: three new versions of one piece of text
// (a caption, the cover text or a photo's speech bubble), with the photo it
// goes with. Nothing is saved: staff pick one and it goes in the field.
// Returns { options } or { error, status }.
export async function remixSocialText(postId, { field, tone, text, index }) {
  if (!REMIX_FIELD_KEYS.includes(field)) return { error: 'Nothing to remix', status: 400 };
  if (tone && !REMIX_TONE_KEYS.includes(tone)) return { error: 'Unknown remix', status: 400 };
  const { data: post } = await supabaseAdmin.from('social_posts').select('id, story, media, cover_index, patients(name)').eq('id', postId).maybeSingle();
  if (!post) return { error: 'post not found', status: 404 };

  const media = Array.isArray(post.media) ? post.media : [];
  const item = media[Number.isInteger(index) ? index : post.cover_index];
  const content = [];
  if (item && (item.kind === 'image' || item.preview_path)) {
    content.push({ type: 'image', source: { type: 'url', url: publicUrl(item.preview_path || item.path) } });
  }
  content.push({ type: 'text', text: buildRemixText({ field, tone, text: String(text || '').slice(0, 3000), story: post.story, petName: post.patients?.name }) });

  let options;
  try {
    const message = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 1500,
      system: SOCIAL_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
      output_config: { format: zodOutputFormat(RemixSchema), effort: 'low' },
    });
    options = message.parsed_output?.options;
    if (!options?.length) throw new Error('The AI did not return any versions');
  } catch (err) {
    return { error: `The AI couldn't do that one: ${err?.message || err}`, status: 502 };
  }

  const short = field === 'cover_headline' || field === 'bubble';
  // An @mention in the caption (the owner's tag) stays in every version.
  const tags = short ? [] : String(text || '').match(/@[A-Za-z0-9._]+/g) || [];
  const clean = options
    .map((o) => String(o || '').replace(/\s*[–—]\s*/g, ', ').trim())
    .map((o) => (short ? cleanHeadline(o) : tags.reduce((acc, tag) => (acc.toLowerCase().includes(tag.toLowerCase()) ? acc : withOwnerTag(acc, tag.slice(1))), o)))
    .filter(Boolean);
  return { options: [...new Set(clean)].slice(0, 3) };
}
