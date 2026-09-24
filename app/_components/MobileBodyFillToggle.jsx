// app/_components/MobileBodyFillToggle.jsx
// Same reasoning as app/(admin)/layout.js's body-fill toggle: a Messenger
// thread needs its own message list to be what scrolls, not the whole
// page, so the reply bar sits fixed at the true bottom of the screen
// instead of drifting off after a long conversation. body's own rule only
// sets a floor (min-height), which never actually caps anything — see
// that file's own comment for why this has to be an imperative class
// toggle rather than a CSS rule everyone else inherits. Split out as its
// own client component so app/mobile/layout.js can stay a server
// component (its metadata/viewport exports can't live in a 'use client'
// file).

'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function MobileBodyFillToggle() {
  const pathname = usePathname();

  useEffect(() => {
    const isMessageThread = pathname?.startsWith('/mobile/messages/');
    document.body.classList.toggle('mobile-body-fill', isMessageThread);
    return () => document.body.classList.remove('mobile-body-fill');
  }, [pathname]);

  return null;
}
