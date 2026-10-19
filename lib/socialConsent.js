// lib/socialConsent.js
// The owner's answer to "may we share photos and videos of your pet on
// Instagram and Facebook?" (clients.social_media_consent, migration 201).
// Asked as a tick on the intake form and on every consent form; staff can
// also set it on the client page.
//
// The tick starts ticked (owners opt out, not in), except for an owner who
// already said no, who sees it unticked. So unticking it is always a
// deliberate no and is saved as one. A ticked box never overrides a no on
// file: a pre-ticked box nobody touched isn't a change of mind. Turning a
// no back into a yes is done by staff on the client page.

import { supabaseAdmin } from './supabaseAdmin.js';

// The new value to store, or undefined for no change.
export function nextSocialConsent(current, ticked) {
  if (ticked === true) return current == null ? true : undefined;
  if (ticked === false) return current === false ? undefined : false;
  return undefined;
}

// Best-effort: never fails the form it came with.
export async function applySocialConsent(clientId, ticked, source) {
  if (!clientId || typeof ticked !== 'boolean') return;
  try {
    const { data } = await supabaseAdmin.from('clients').select('social_media_consent').eq('id', clientId).maybeSingle();
    const next = nextSocialConsent(data?.social_media_consent ?? null, ticked);
    if (next === undefined) return;
    await supabaseAdmin
      .from('clients')
      .update({ social_media_consent: next, social_media_consent_at: new Date().toISOString(), social_media_consent_source: source })
      .eq('id', clientId);
  } catch (err) {
    console.error('Failed to save social media consent', clientId, err);
  }
}

