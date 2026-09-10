// app/_components/useHospitalizationUpdatePending.js
// Shared "does any admitted hospitalization need an update?" check.
// This covers both a client's explicit Request an Update flag and the
// twice-daily cage-update deadlines (morning by 12:00, afternoon by 18:00).
// It drives the desktop Hospitalization nav link and the mobile app's
// Hospitalization tile / cleaner Hospital tab.
//
// The one-minute timer matters for scheduled deadlines: unlike a client
// request, noon and 18:00 can arrive without any database row changing.
// Realtime listeners make the signal clear promptly when a worksheet entry
// is saved or an admission changes.
//
// app/mobile/page.js calls this at its own top level AND renders
// MobileCleanerTabs (which calls it again internally) at the same time
// for a cleaner. useId() gives every hook instance its own Supabase topic
// so simultaneous mounts never collide.

'use client';

import { useEffect, useId, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function useHospitalizationUpdatePending() {
  const [pending, setPending] = useState(false);
  const id = useId();

  useEffect(() => {
    let active = true;

    const checkPending = () =>
      fetch('/api/hospitalizations?status=admitted')
        .then((res) => res.json())
        .then((data) => {
          if (!active) return;
          const list = Array.isArray(data) ? data : [];
          setPending(list.some((h) => h.update_requested_at || h.scheduled_update_overdue));
        })
        .catch(() => {});

    checkPending();
    const timer = window.setInterval(checkPending, 60 * 1000);

    const channel = supabase
      .channel(`hospitalization-update-attention-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitalizations' }, checkPending)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitalization_notes' }, checkPending)
      .subscribe();

    return () => {
      active = false;
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [id]);

  return pending;
}
