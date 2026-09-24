// app/_components/useClientMessagesPending.js
// "Is anything in the messages inbox waiting on a reply" — same GET
// /api/client-messages summary the desktop nav badge and /messages inbox
// both already use, just polled/subscribed for the mobile Messenger tile's
// own badge. Same poll-plus-realtime belt-and-suspenders as
// useHospitalizationUpdatePending, for the same reason: a conversation can
// go from answered to pending purely from time passing (none does here,
// but consistency with the one existing badge hook outweighs trimming it).

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function useClientMessagesPending() {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const load = () =>
      fetch('/api/client-messages')
        .then((res) => res.json())
        .then((data) => setPendingCount(Array.isArray(data) ? data.filter((c) => c.pending).length : 0));

    load();
    const timer = window.setInterval(load, 60 * 1000);
    const channel = supabase
      .channel('mobile-client-messages-pending')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_messages' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_message_thread_state' }, load)
      .subscribe();
    return () => {
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  return pendingCount;
}
