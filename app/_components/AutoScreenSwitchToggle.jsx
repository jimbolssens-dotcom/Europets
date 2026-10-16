'use client';

// Shows ONLY on a device where the fold auto-switch is already on (see
// lib/screenModeSwitch.js), as a small "on · turn off" chip. Nobody else
// ever sees it: the switch is turned on with a private link
// (?fold-switch=on, handled by AutoScreenSwitcher), not from a button
// staff would see on their own phones.

import { useEffect, useState } from 'react';
import { autoSwitchEnabled, setAutoSwitch } from '@/lib/screenModeSwitch';

export default function AutoScreenSwitchToggle({ className = '' }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(autoSwitchEnabled());
    sync();
    window.addEventListener('europets-auto-switch-changed', sync);
    return () => window.removeEventListener('europets-auto-switch-changed', sync);
  }, []);

  if (!on) return null;
  return (
    <span
      className={`auto-screen-switch-toggle ${className}`.trim()}
      title="This phone switches to the mobile app on the cover screen and the desktop app when unfolded."
    >
      📐 Fold switch on ·{' '}
      <button type="button" className="mobile-link-btn" onClick={() => setAutoSwitch(false)}>
        turn off
      </button>
    </span>
  );
}
