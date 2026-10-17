'use client';

// Makes the app's ordinary links switch pages inside the app
// instead of reloading it. Every page links with a plain <a href>, and a
// plain link throws the whole app away and starts it again on each click:
// download it, rebuild the nav, reconnect its live updates, then fetch the
// page's own data. Here a click on a link to another page of the same
// app is handed to the Next.js router instead, which keeps the nav and
// the connection, and already has the page's code ready: fetched when the
// pointer goes over the link, and for the links on screen (the nav, the
// mobile home buttons) shortly after each page settles, since a phone
// has no pointer to hover with.
//
// Left as a normal browser link: new tab / window (target, ctrl/cmd/
// shift/alt, middle click), downloads, files and API links (PDFs), other
// sites, the other apps (desktop <-> /mobile, /portal, /client-app,
// /login), and a
// link to the page already open (with a different ?query the page would
// not reload its data, since it isn't mounted again). A link can opt out
// with data-full-reload.
//
// Mounted once in app/(admin)/layout.js (scope "desktop") and once in
// app/mobile/layout.js (scope "mobile": only /mobile/... pages) and
// app/client-app/layout.js (scope "client-app").

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { prefetchPageData } from '@/lib/prefetchData';

// The top-level paths of the desktop app (app/(admin)/*).
const DESKTOP_SECTIONS = new Set([
  'accounting', 'add', 'appointments', 'catalog', 'cattery', 'clients', 'concierge-review', 'consults',
  'day-procedures', 'empty-reports', 'follow-ups', 'hospitalization', 'imaging-reports',
  'intake', 'invoices', 'messages', 'patients', 'policies', 'proforma', 'reviews', 'rooms',
  'search', 'settings', 'shift-tally', 'staff', 'storage', 'vaccinations', 'vaccine-protocols',
]);

// How many on-screen links to get ready after a page settles.
const PREFETCH_ON_SCREEN = 20;

// Pages that sit outside the app's normal frame (no nav), so they keep a
// full page load in and out.
const FULL_LOAD_PATHS = new Set(['/hospitalization/wall', '/day-procedures/wall']);

export function inAppTarget(href, current, scope = 'desktop') {
  let url;
  try {
    url = new URL(href, current.href);
  } catch {
    return null;
  }
  if (url.origin !== current.origin) return null;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const section = path.split('/')[1] || '';
  if (scope === 'mobile' || scope === 'client-app') {
    if (section !== scope) return null;
  } else if (path !== '/' && !DESKTOP_SECTIONS.has(section)) {
    return null;
  }
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

export default function InAppLinks({ scope = 'desktop' }) {
  const router = useRouter();
  const pathname = usePathname();

  // Once the page has settled, get the code of the pages its links lead
  // to, quietly in the background.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const seen = new Set();
      for (const a of document.querySelectorAll('a[href]')) {
        if (seen.size >= PREFETCH_ON_SCREEN) break;
        if (a.target && a.target !== '_self') continue;
        const target = inAppTarget(a.getAttribute('href'), window.location, scope);
        if (!target || seen.has(target)) continue;
        seen.add(target);
        router.prefetch(target);
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [router, scope, pathname]);

  useEffect(() => {
    const prefetched = new Set();
    // The page's data is only asked for once the pointer rests on a link
    // a moment, so sweeping across a long list doesn't ask for every row.
    let dataTimer = null;
    let dataTarget = null;
    const cancelData = () => {
      window.clearTimeout(dataTimer);
      dataTimer = null;
      dataTarget = null;
    };

    function onClick(event) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const a = linkFrom(event);
      if (!a) return;
      const target = inAppTarget(a.getAttribute('href'), window.location, scope);
      if (!target) return;
      event.preventDefault();
      cancelData();
      router.push(target);
    }

    function onPointerOver(event) {
      const a = linkFrom(event);
      const target = a ? inAppTarget(a.getAttribute('href'), window.location, scope) : null;
      // The page's own data too (consult, stay, invoice, client, patient):
      // each rest on a link asks again, since that answer is only used
      // while fresh.
      if (target !== dataTarget) {
        cancelData();
        if (target && scope === 'desktop') {
          dataTarget = target;
          dataTimer = window.setTimeout(() => prefetchPageData(target), 80);
        }
      }
      if (!target || prefetched.has(target)) return;
      prefetched.add(target);
      router.prefetch(target);
    }

    document.addEventListener('click', onClick);
    document.addEventListener('pointerover', onPointerOver, { passive: true });
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('pointerover', onPointerOver);
      cancelData();
    };
  }, [router, scope]);

  return null;
}
