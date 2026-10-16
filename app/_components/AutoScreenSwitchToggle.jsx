'use client';

// The per-device on/off for AutoScreenSwitcher: a small chip, off by
// default. Stored only in this browser (lib/screenModeSwitch.js), so
// turning it on affects this phone and nothing else.

import { useEffect, useState } from 'react';
import { autoSwitchEnabled, setAutoSwitch } from '@/lib/screenModeSwitch';

export default function AutoScreenSwitchToggle({ className = '' }) {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(autoSwitchEnabled()), []);

  return (
    <label
      className={`auto-screen-switch-toggle ${className}`.trim()}
      title="For a foldable phone: the cover screen shows the mobile app, unfolded shows the desktop one. Only on this device."
    >
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          setAutoSwitch(e.target.checked);
          setOn(e.target.checked);
        }}
      />
      📐 Fold auto-switch (this device)
    </label>
  );
}
