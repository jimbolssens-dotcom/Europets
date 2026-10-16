'use client';

// Makes the desktop app's ordinary links switch pages inside the app
// instead of reloading it. Every page links with a plain <a href>, and a
// plain link throws the whole app away and starts it again on each click:
// download it, rebuild the nav, reconnect its live updates, then fetch the
// page's own data. Here a click on a link to another desktop page is
// handed to the Next.js router instead, which keeps the nav and the
// connection, and already has the page's code ready (fetched when the
// pointer goes over the link).
//
// Left as a normal browser link: new tab / window (target, ctrl/cmd/
// shift/alt, middle click), downloads, files and API links (PDFs), other
// sites, the other apps (/mobile, /portal, /client-app, /login), and a
// link to the page already open (with a different ?query the page would
// not reload its data, since it isn't mounted again). A link can opt out
// with data-full-reload.
//
// Mounted once in app/(admin)/layout.js.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// The top-level paths of the desktop app (app/(admin)/*).
const DESKTOP_SECTIONS = new Set([
  'accounting', 'add', 'appointments', 'catalog', 'cattery', 'clients', 'consults',
  'day-procedures', 'empty-reports', 'follow-ups', 'hospitalization', 'imaging-reports',
  'intake', 'invoices', 'messages', 'patients', 'policies', 'proforma', 'reviews', 'rooms',
  'search', 'settings', 'shift-tally', 'staff', 'storage', 'vaccinations', 'vaccine-protocols',
]);

// Pages that sit outside the app's normal frame (no nav), so they keep a
// full page load in and out.
const FULL_LOAD_PATHS = new Set(['/hospitalization/wall', '/day-procedures/wall']);

export function inAppTarget(href, current) {
  let url;
  try {
    url = new URL(href, current.href);
  } catch {
    return null;
  }
  if (url.origin !== current.origin) return null;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const section = path.split('/')[1] || '';
  if (path !== '/' && !DESKTOP_SECTIONS.has(section)) return null;
  if (/\.[a-z0-9]+$/i.test(path)) return null;
  if (FULL_LOAD_PATHS.has(path) || FULL_LOAD_PATHS.has(current.pathname.replace(/\/+$/, ''))) return null;
  if (path === (current.pathname.replace(/\/+$/, '') || '/')) return null;
  return url.pathname + url.search + url.hash;
}

function linkFrom(event) {
  const a = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!a) return null;
  if (a.target && a.target !== '_self') return null;
  if (a.hasAttribute('download') || a.hasAttribute('data-full-reload')) return null;
  return a;
}

export default function InAppLinks() {
  const router = useRouter();

  useEffect(() => {
    const prefetched = new Set();

    function onClick(event) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const a = linkFrom(event);
      if (!a) return;
      const target = inAppTarget(a.getAttribute('href'), window.location);
      if (!target) return;
      event.preventDefault();
      router.push(target);
    }

    function onPointerOver(event) {
      const a = linkFrom(event);
      if (!a) return;
      const target = inAppTarget(a.getAttribute('href'), window.location);
      if (!target || prefetched.has(target)) return;
      prefetched.add(target);
      router.prefetch(target);
    }

    document.addEventListener('click', onClick);
    document.addEventListener('pointerover', onPointerOver, { passive: true });
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('pointerover', onPointerOver);
    };
  }, [router]);

  return null;
}
