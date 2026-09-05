// lib/usePossibleClientMatches.js
// For every submitted intake request not already tied to a client, check
// whether its phone number or name already matches an existing one — a
// strong sign this is the same person calling in again, not a genuinely
// new one — so staff can attach the pet(s) to that client instead of
// creating a duplicate. Shared by the Invite page and the Appointment
// Requests panel, since either can show a brand-new-client submission.

import { useEffect, useState } from 'react';
import { phoneSearchDigits } from '@/lib/phoneMatch';

export function usePossibleClientMatches(requests) {
  const [possibleMatches, setPossibleMatches] = useState({});

  useEffect(() => {
    const toCheck = requests.filter((r) => r.status === 'submitted' && !r.client_id && !(r.id in possibleMatches));
    if (toCheck.length === 0) return;

    toCheck.forEach(async (r) => {
      const digits = phoneSearchDigits(r.phone);
      const [byPhone, byName] = await Promise.all([
        digits ? fetch(`/api/clients?phone=${digits}`).then((res) => res.json()) : Promise.resolve([]),
        r.full_name ? fetch(`/api/clients?name=${encodeURIComponent(r.full_name.trim())}`).then((res) => res.json()) : Promise.resolve([]),
      ]);
      const byId = new Map();
      for (const c of [...(Array.isArray(byPhone) ? byPhone : []), ...(Array.isArray(byName) ? byName : [])]) {
        byId.set(c.id, c);
      }
      setPossibleMatches((prev) => ({ ...prev, [r.id]: [...byId.values()] }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests]);

  return possibleMatches;
}
