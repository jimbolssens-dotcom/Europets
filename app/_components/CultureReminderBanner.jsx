// app/_components/CultureReminderBanner.jsx
// A small, warm reminder banner shown once a day (per browser) on both the
// desktop admin app and the mobile recording app — the clinic's #1 standard
// (kindness, warmth, compassion — see the "Our Culture" policy) is easy to
// let slip on a busy day, so this puts a gentle nudge in front of staff
// without blocking anything. Dismissible; picks a new message the next day.

'use client';

import { useEffect, useState } from 'react';

const MESSAGES = [
  "😊 Smile first — it's the one thing every client and patient notices before anything else.",
  '💛 Kindness costs nothing. It\'s also the reason clients trust us with their pets.',
  "🐾 Every pet is a little scared and every owner is a little worried. Meet both with patience.",
  '✨ Warm, attentive, present — that\'s the standard, every single client, every single time.',
  '🙌 Nobody is ever "just a walk-in" or "just a question." Make everyone feel like a priority.',
  "💬 A client who feels heard is a client who trusts us. Listen first, explain second.",
  '🌟 Compassion is a skill, just like any clinical one — practice it on purpose, all day.',
  '🐶 Crouch down, speak softly, greet the pet by name. The small things are the big things.',
  '❤️ Never make someone feel like a burden for needing extra reassurance.',
  '😊 Having a rough day? The client in front of you doesn\'t know that — give them your best anyway.',
];

const STORAGE_KEY = 'europets-culture-reminder-dismissed';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function messageForToday() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000
  );
  return MESSAGES[dayOfYear % MESSAGES.length];
}

export default function CultureReminderBanner() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let dismissedDate = null;
    try {
      dismissedDate = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage unavailable (private mode, etc.) — just show it every time.
    }
    if (dismissedDate === todayKey()) return;
    setMessage(messageForToday());
    setVisible(true);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, todayKey());
    } catch {
      // Nothing we can do if storage isn't available — it'll just show again next load.
    }
  }

  if (!visible) return null;

  return (
    <div className="culture-reminder">
      <span className="culture-reminder-text">{message}</span>
      <button type="button" className="culture-reminder-dismiss" onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
