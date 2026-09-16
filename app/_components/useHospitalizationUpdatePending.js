// app/_components/useHospitalizationUpdatePending.js
// Shared "does any admitted hospitalization need attention?" check,
// returning the worst alarm level found across all of them ('none' |
// 'yellow' | 'red' | 'both' — see lib/hospitalizationAttention.js): a
// client's explicit Request an Update flag, the twice-daily cage-update
// deadlines (morning by 12:00, afternoon by 18:00), and a staff-requested
// doctor checkup all roll up into this one signal.
//
// kind ('admission' | 'day_procedure' | null for both, default
// 'admission') scopes which hospitalizations count — it exists because
// the desktop Cage Layout page only ever shows kind='admission' cases
// (day procedures have their own separate page/wall), so a bell that
// counted both would light up over "Hospitalization" for an alarm no
// cage on that page could ever show, with nothing on Day Procedures
// pointing at it either — see the matching bell on the Day Procedures nav
// link, called with kind: 'day_procedure'.
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
import { hospitalizationAlarmLevel, combineAlarmLevels } from '@/lib/hospitalizationAttention';

export function useHospitalizationUpdatePending({ kind = 'admission' } = {}) {
  const [level, setLevel] = useState('none');
  const id = useId();

  useEffect(() => {
    let active = true;
    const url = `/api/hospitalizations?status=admitted${kind ? `&kind=${kind}` : ''}`;

    const checkPending = () =>
      fetch(url)
        .then((res) => res.json())
        .then((data) => {
          if (!active) return;
          const list = Array.isArray(data) ? data : [];
          setLevel(combineAlarmLevels(list.map(hospitalizationAlarmLevel)));
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
  }, [id, kind]);

  return level;
}
