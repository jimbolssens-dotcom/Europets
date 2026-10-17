'use client';

// A small "⋯ More ▾" menu for a page's less-used actions, so the action
// row keeps only what's used every day (first used on the patient page).
// Children are the menu's buttons and links, with optional
// <ActionMenu.Group label="..."> headings. Picking any item, clicking
// outside, or pressing Escape closes it.

import { useEffect, useRef } from 'react';

// `active` highlights the button (e.g. while one of the menu's views is open).
export default function ActionMenu({ label = '⋯ More', align = 'left', active = false, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const close = (event) => {
      const el = ref.current;
      if (!el || !el.open) return;
      if (event.type === 'keydown' ? event.key === 'Escape' : !el.contains(event.target)) el.open = false;
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, []);

  // Close once an item has been picked (its own onClick runs first).
  function onPick(event) {
    if (event.target.closest('button, a') && ref.current) ref.current.open = false;
  }

  return (
    <details className="action-menu" ref={ref}>
      <summary className={`case-tab${active ? ' case-tab-on' : ''}`}>{label} ▾</summary>
      <div className={`action-menu-pop action-menu-pop-${align}`} onClick={onPick}>
        {children}
      </div>
    </details>
  );
}

ActionMenu.Group = function ActionMenuGroup({ label }) {
  return <h4 className="action-menu-group">{label}</h4>;
};
