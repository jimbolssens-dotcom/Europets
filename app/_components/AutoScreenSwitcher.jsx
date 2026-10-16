'use client';

// Switches between the mobile app and the desktop app as the screen
// changes size, for a foldable phone: cover screen = mobile, unfolded =
// desktop (see lib/screenModeSwitch.js). Does nothing at all unless this
// device has turned it on (AutoScreenSwitchToggle), so every other phone
// and tablet behaves exactly as before. Never switches while someone is
// typing in a field: it waits until they leave it, so a half-written
// note or reply isn't lost.

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { autoSwitchEnabled, desktopPathFor, mobilePathFor, sideOf, WIDE_SCREEN_QUERY } from '@/lib/screenModeSwitch';

function typingInField() {
  const el = document.activeElement;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

// Desktop /hospitalization/:id covers day procedures too, which have their
// own page on mobile.
async function mobileTargetFor(path) {
  const m = path.match(/^\/hospitalization\/([^/]+)$/);
  if (m && !['cages', 'wall'].includes(m[1])) {
    try {
      const res = await fetch(`/api/hospitalizations/${m[1]}`);
      const data = await res.json();
      if (data?.kind === 'day_procedure') return `/mobile/day-procedures/${m[1]}`;
    } catch {
      // Fall through to the hospitalization page.
    }
  }
  return mobilePathFor(path);
}

export default function AutoScreenSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const switching = useRef(false);

  useEffect(() => {
    const media = window.matchMedia(WIDE_SCREEN_QUERY);

    async function check() {
      if (switching.current || !autoSwitchEnabled()) return;
      const side = sideOf(pathname || '');
      if (!side) return;
      const wantSide = media.matches ? 'desktop' : 'mobile';
      if (side === wantSide) return;
      if (typingInField()) {
        document.addEventListener('focusout', () => setTimeout(check, 50), { once: true });
        return;
      }
      switching.current = true;
      const query = window.location.search || '';
      const target = wantSide === 'desktop' ? desktopPathFor(pathname) : await mobileTargetFor(pathname);
      router.replace(`${target}${target === pathname ? query : ''}`);
    }

    switching.current = false;
    check();
    media.addEventListener('change', check);
    window.addEventListener('europets-auto-switch-changed', check);
    return () => {
      media.removeEventListener('change', check);
      window.removeEventListener('europets-auto-switch-changed', check);
    };
  }, [pathname, router]);

  return null;
}
