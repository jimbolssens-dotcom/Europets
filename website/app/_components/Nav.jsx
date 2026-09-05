'use client';

import { useState } from 'react';
import { NAV_LINKS, BOOKING_URL } from '@/lib/content';

export default function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="nav">
      <div className="container nav-row">
        <a href="/" className="nav-brand">
          <img src="/logo.png" alt="Europets Clinic" />
        </a>

        <nav className="nav-links nav-links-desktop">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="nav-actions">
          <a href={BOOKING_URL} className="btn btn-primary nav-cta">
            Book an Appointment
          </a>
          <button
            type="button"
            className="nav-burger"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {open && (
        <nav className="nav-links-mobile">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}
          <a href={BOOKING_URL} className="btn btn-primary" onClick={() => setOpen(false)}>
            Book an Appointment
          </a>
        </nav>
      )}
    </header>
  );
}
