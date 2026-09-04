// app/_components/useMobileStaff.js
// Read-only lookup of "who is this phone" — resolves the staff id
// remembered in localStorage (see MOBILE_STAFF_STORAGE_KEY, written by the
// picker on app/mobile/page.js) against the full staff list, so any mobile
// page can read the current staff member's role (e.g. "is this a
// cleaner?") without re-fetching or re-deriving it itself. Picking/
// switching staff still only happens on the mobile home page.

import { useEffect, useState } from 'react';

export const MOBILE_STAFF_STORAGE_KEY = 'europets_mobile_staff_id';

export function useMobileStaff() {
  const [staffId, setStaffId] = useState(null);
  const [staff, setStaff] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setStaffId(localStorage.getItem(MOBILE_STAFF_STORAGE_KEY));
    fetch('/api/staff')
      .then((res) => res.json())
      .then((data) => {
        setStaff(Array.isArray(data) ? data : []);
        setReady(true);
      });
  }, []);

  const me = staff.find((s) => s.id === staffId) || null;

  return { staffId, me, ready, isCleaner: me?.role === 'cleaner' };
}
