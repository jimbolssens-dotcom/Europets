// app/_components/useCatteryAlarm.js
// "Has any checked-in cattery cat gone without today's weight past 18:00
// Dubai time?" — the Cattery nav link's alarm (desktop nav and the mobile
// home tile), same shape as useHospitalizationUpdatePending: a one-minute
// timer (the 18:00 deadline arrives with no database change) plus realtime
// so it clears the moment a weight is saved. Returns true/false.

'use client';

import { useEffect, useId, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { weightOverdue } from '@/lib/cattery';

export function useCatteryAlarm() {
  const [overdue, setOverdue] = useState(false);
  const id = useId();

  useEffect(() => {
    let active = true;
    const check = () =>
      fetch('/api/cattery?active=1', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          if (!active) return;
          const list = Array.isArray(data) ? data : [];
          setOverdue(list.some((b) => weightOverdue(b, b.cattery_daily_logs)));
        })
        .catch(() => {});

    check();
    const timer = window.setInterval(check, 60 * 1000);
    const channel = supabase
      .channel(`cattery-alarm-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cattery_bookings' }, check)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cattery_daily_logs' }, check)
      .subscribe();
    return () => {
      active = false;
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [id]);

  return overdue;
}
