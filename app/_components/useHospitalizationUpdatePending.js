// app/_components/useHospitalizationUpdatePending.js
// Shared "is any admitted case waiting on a client-requested update?"
// check — same signal that blinks the cage on the Cage Layout page and
// the Hospitalization link in the desktop top nav (see app/(admin)/
// layout.js), reused here for the mobile app's home screen (both the
// normal staff tile grid and the cleaner's Hospital tab).

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function useHospitalizationUpdatePending() {
  const [pending, setPending] = useState(false);

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
      .channel('mobile-hospitalization-update-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitalizations' }, checkPending)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  return pending;
}
