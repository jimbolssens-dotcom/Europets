// app/_components/useHospitalizationUpdatePending.js
// Shared "is any admitted case waiting on a client-requested update?"
// check — same signal that blinks the cage on the Cage Layout page and
// the Hospitalization link in the desktop top nav (see app/(admin)/
// layout.js), reused here for the mobile app's home screen (both the
// normal staff tile grid and the cleaner's Hospital tab).
//
// app/mobile/page.js calls this at its own top level AND renders
// MobileCleanerTabs (which calls it again internally) at the same time
// for a cleaner — two hook instances mounted simultaneously. Supabase's
// client returns the SAME channel object for a topic name that's already
// registered, so a hardcoded shared name meant the second instance's
// `.on()` call landed on a channel the first instance had already
// `.subscribe()`d — which throws ("cannot add postgres_changes callbacks
// ... after subscribe()"), crashing the whole page for any cleaner
// account. useId() gives every hook instance its own topic so
// simultaneous mounts never collide.

'use client';

import { useEffect, useId, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function useHospitalizationUpdatePending() {
  const [pending, setPending] = useState(false);
  const id = useId();

  useEffect(() => {
    const checkPending = () =>
      fetch('/api/hospitalizations?status=admitted')
        .then((res) => res.json())
        .then((data) => {
          const list = Array.isArray(data) ? data : [];
          setPending(list.some((h) => h.update_requested_at));
        });

    checkPending();

    const channel = supabase
      .channel(`mobile-hospitalization-update-requests-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitalizations' }, checkPending)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [id]);

  return pending;
}
