'use client';

// Puts a page's main buttons into the phone top strip, between the page
// name and Settings (app/(admin)/layout.js renders the #phone-top-slot),
// so they don't need a line of their own on a phone. Only shows on a
// phone; the page keeps its own copy of the buttons for wider screens and
// marks that copy `phone-hide` so it isn't shown twice (globals.css).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function PhoneTop({ children }) {
  const [slot, setSlot] = useState(null);
  useEffect(() => {
    setSlot(document.getElementById('phone-top-slot'));
  }, []);
  return slot ? createPortal(children, slot) : null;
}
