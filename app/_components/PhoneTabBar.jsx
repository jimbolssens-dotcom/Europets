'use client';

// The desktop app's menu on a phone (below 600px wide): instead of the
// logo, 8 text links and 7 icons filling the top third of the screen, a
// bar fixed at the bottom with the five main sections and a "More" panel
// for the rest (Day Procedures, Cattery, Invoices, the phone app). The
// top keeps the logo and Settings. The wall displays, client app,
// log out and the "explain this" mode stay on the desktop menu only.
// Alerts are the same ones the desktop menu shows, as a dot on the icon:
// amber when something is waiting, red when it's urgent. Hidden on wider
// screens (globals.css), where the normal menu shows.

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

function isOn(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Dot({ alert }) {
  if (!alert) return null;
  return <span className={`phone-tab-dot${alert === 'red' ? ' phone-tab-dot-red' : ''}`} aria-hidden="true" />;
}

export default function PhoneTabBar({ main, more }) {
  const pathname = usePathname() || '';
  const [moreOpen, setMoreOpen] = useState(false);

  // Picking a page from More (or anywhere) closes the panel.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const moreOn = more.some((item) => isOn(pathname, item.href));
  const moreAlert = more.some((item) => item.alert === 'red') ? 'red' : more.some((item) => item.alert) ? 'amber' : '';

  return (
    <>
      {moreOpen && (
        <>
          <div className="phone-more-backdrop" onClick={() => setMoreOpen(false)} />
          <div className="phone-more-sheet" role="menu">
            {more.map((item) => (
              <a key={item.href} href={item.href} className={isOn(pathname, item.href) ? 'phone-more-on' : undefined} title={item.title}>
                <span className="phone-tab-icon">{item.icon}</span>
                {item.label}
                <Dot alert={item.alert} />
              </a>
            ))}
          </div>
        </>
      )}
      <nav className="phone-tabbar" aria-label="Main menu">
        {main.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={`phone-tab${isOn(pathname, item.href) ? ' phone-tab-on' : ''}`}
            title={item.title}
          >
            <span className="phone-tab-icon">{item.icon}</span>
            <span>{item.label}</span>
            <Dot alert={item.alert} />
          </a>
        ))}
        <button
          type="button"
          className={`phone-tab${moreOpen || moreOn ? ' phone-tab-on' : ''}`}
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
        >
          <span className="phone-tab-icon">☰</span>
          <span>More</span>
          <Dot alert={moreAlert} />
        </button>
      </nav>
    </>
  );
}
