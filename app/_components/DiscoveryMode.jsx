// app/_components/DiscoveryMode.jsx
// Training mode: while ON, no click, checkbox/select change, or form
// submission anywhere in the staff app performs its real action — a
// capture-phase listener on `document` intercepts it (preventDefault +
// stopPropagation, before it ever reaches the element's own React
// onClick/onSubmit handler, so nothing gets written to the database) and
// shows a popup explaining what that control actually does instead. Meant
// for onboarding: staff can press anything, anywhere, with zero risk.
//
// Any element can carry a real, hand-written explanation via
// data-discover="...". Without one, the popup falls back to a generic
// guess from ACTION_HINTS below, matched against the element's own visible
// label — not a substitute for real coverage, but better than nothing for
// the very large number of buttons across this app that don't have one
// written yet. Add data-discover to a button/link/etc. any time it's worth
// a proper explanation.
//
// Persisted in localStorage so it survives page navigation (a full page
// load, not client-side routing, in this app's nav) while staff explore.

'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const STORAGE_KEY = 'europets-discovery-mode';

const ACTION_HINTS = [
  { match: /delete|remove/i, hint: 'Permanently deletes this. This cannot be undone.' },
  { match: /save|submit|record payment|log payment/i, hint: 'Saves whatever is above and would normally write it to the record.' },
  { match: /^cancel$/i, hint: "Closes this without saving anything — nothing you typed above is kept." },
  { match: /^edit$/i, hint: 'Opens this for editing.' },
  { match: /^(\+\s*)?(add|new)\b/i, hint: 'Adds a new entry.' },
  { match: /apply/i, hint: 'Applies this to the record you select.' },
  { match: /print/i, hint: 'Opens the print dialog for this document.' },
  { match: /export|download/i, hint: 'Downloads a copy of this data to your device.' },
  { match: /^close$/i, hint: 'Closes this panel.' },
  { match: /log ?out|sign ?out/i, hint: 'Logs you out of the app — you would need to sign back in.' },
  { match: /discharge/i, hint: 'Marks this case as discharged/complete.' },
  { match: /merge/i, hint: 'Combines this into another record — usually not reversible.' },
  { match: /void/i, hint: 'Cancels this invoice/record without deleting it, keeping a record it existed.' },
];

function describeElement(el) {
  const explained = el.closest('[data-discover]');
  const visibleLabel =
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70) ||
    (el.tagName === 'A' ? el.getAttribute('href') : '') ||
    el.tagName.toLowerCase();

  if (explained) {
    return { label: visibleLabel || 'This control', text: explained.getAttribute('data-discover') };
  }

  const hint = ACTION_HINTS.find((h) => h.match.test(visibleLabel));
  const kind =
    el.tagName === 'A' ? 'Link' : el.tagName === 'SELECT' ? 'Dropdown' : el.tagName === 'INPUT' ? 'Checkbox/field' : 'Button';

  return {
    label: visibleLabel || kind,
    text: hint
      ? hint.hint
      : `No training note written for this one yet — going by its label, "${visibleLabel}" is what it does.`,
  };
}

export default function DiscoveryMode() {
  const [active, setActive] = useState(false);
  const [popup, setPopup] = useState(null); // { label, text, x, y }
  const [mounted, setMounted] = useState(false);
  const dismissTimerRef = useRef(null);

  useEffect(() => {
    setMounted(true);
    try {
      setActive(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {}
  }, []);

  function toggle() {
    setActive((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {}
      if (!next) setPopup(null);
      return next;
    });
  }

  useEffect(() => {
    if (!active) return undefined;

    function findInteractive(target) {
      if (!(target instanceof Element)) return null;
      return target.closest(
        'button, a, [role="button"], select, input[type="checkbox"], input[type="radio"], input[type="submit"], [data-discover]'
      );
    }

    // Shared by click, mousedown, and dblclick — some of this app's
    // custom controls (the Appointments calendar's drag-to-reschedule and
    // double-click-to-open blocks, its click-to-book empty time slots)
    // don't use a plain click at all: dragging starts on mousedown, and a
    // browser's own dblclick event fires independently of the click
    // events that precede it, so stopping click alone wouldn't reliably
    // stop either. Intercepting all three the same way covers both plain
    // buttons and these custom drag/double-click interactions.
    function onIntercept(e) {
      // e.target can be a non-Element (a text node) in rare cases —
      // .closest only exists on Element.
      if (!(e.target instanceof Element)) return;

      // Discovery Mode's own UI (the toggle, the banner's "Turn off"
      // button) has to keep working normally, or there'd be no way to
      // turn it back off from inside itself.
      if (e.target.closest('[data-discovery-control]')) return;

      const el = findInteractive(e.target);
      if (!el) return;

      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();

      const info = describeElement(el);
      clearTimeout(dismissTimerRef.current);
      setPopup({ ...info, x: e.clientX, y: e.clientY });
    }

    function onSubmit(e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      clearTimeout(dismissTimerRef.current);
      setPopup({
        label: 'Form',
        text: 'Submitting this would normally save the form above — nothing was actually sent.',
        x: Math.round(window.innerWidth / 2) - 150,
        y: 70,
      });
    }

    document.addEventListener('click', onIntercept, true);
    document.addEventListener('mousedown', onIntercept, true);
    document.addEventListener('dblclick', onIntercept, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      document.removeEventListener('click', onIntercept, true);
      document.removeEventListener('mousedown', onIntercept, true);
      document.removeEventListener('dblclick', onIntercept, true);
      document.removeEventListener('submit', onSubmit, true);
      clearTimeout(dismissTimerRef.current);
    };
  }, [active]);

  const overlay =
    mounted &&
    createPortal(
      <>
        {active && (
          <div className="discovery-banner">
            🔍 Discovery Mode is ON — nothing you click makes a real change. Click any button, link, checkbox, or
            form to see what it does.{' '}
            <button type="button" data-discovery-control onClick={toggle}>
              Turn off
            </button>
          </div>
        )}
        {active && popup && (
          <div
            className="discovery-popup"
            style={{ left: Math.min(popup.x, window.innerWidth - 320), top: popup.y + 12 }}
            onClick={() => setPopup(null)}
          >
            <strong>{popup.label}</strong>
            <p>{popup.text}</p>
            <span className="discovery-popup-hint">Tap anywhere to dismiss</span>
          </div>
        )}
      </>,
      document.body
    );

  return (
    <>
      <button
        type="button"
        data-discovery-control
        onClick={toggle}
        title={active ? 'Discovery Mode is ON — click to turn off' : 'Turn on Discovery Mode (training mode)'}
        aria-label="Toggle Discovery Mode"
        className={`settings-link discovery-toggle${active ? ' discovery-toggle-active' : ''}`}
      >
        🔍
      </button>
      {overlay}
    </>
  );
}
