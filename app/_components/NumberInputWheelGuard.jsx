// app/_components/NumberInputWheelGuard.jsx
// Chrome/Edge/Firefox all quietly change a focused <input type="number">'s
// value on mouse-wheel scroll, stepping it by its `step` — with no visual
// cue it's happening. On any page with a number field sitting next to a
// long, scrollable list (a hospitalization worksheet, an invoice's line
// items, ...), scrolling straight past it while it happens to be focused
// silently corrupts it — exactly what turned a hospitalization's daily-
// rate quantity into 0.31 instead of a whole day count, with no one ever
// touching the field on purpose. Rather than patch each of this app's 60+
// number inputs individually, blur the field the instant a wheel event
// reaches it while focused, so scrolling the page just scrolls the page —
// mounted once in the root layout, so it's in effect everywhere.

'use client';

import { useEffect } from 'react';

export default function NumberInputWheelGuard() {
  useEffect(() => {
    function handleWheel() {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement && el.type === 'number') {
        el.blur();
      }
    }
    document.addEventListener('wheel', handleWheel, { passive: true });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);

  return null;
}
