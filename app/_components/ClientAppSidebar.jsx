// app/_components/ClientAppSidebar.jsx
// Desktop-width companion to ClientAppNav's fixed bottom tab bar — same
// TABS, same "hidden until logged in" rule, just laid out as a persistent
// left sidebar instead. Both render unconditionally; which one is actually
// visible is a pure CSS decision (see globals.css's CLIENT APP DESKTOP
// section, @media min-width) so there's no layout flash while JS figures
// out the viewport width.

'use client';

import { usePathname } from 'next/navigation';
import { useClientAppSession } from './useClientAppSession';
import HexIcon from './HexIcon';
import { TABS } from './ClientAppNav';

export default function ClientAppSidebar() {
  const { clientId, ready, logout } = useClientAppSession();
  const pathname = usePathname();

  if (!ready || !clientId) return null;

  return (
    <aside className="client-app-sidebar">
      <div className="client-app-sidebar-brand">
        <HexIcon>🐾</HexIcon>
        <div>
          <div className="client-app-sidebar-brand-name">Europets</div>
          <div className="client-app-sidebar-brand-label">Client Portal</div>
        </div>
      </div>

      <nav className="client-app-sidebar-nav">
        {TABS.map((tab) => (
          <a
            key={tab.href}
            href={tab.href}
            className={`client-app-sidebar-item${pathname === tab.href ? ' client-app-sidebar-item-active' : ''}`}
          >
            <HexIcon>{tab.icon}</HexIcon>
            <span>{tab.label}</span>
          </a>
        ))}
      </nav>

      <a
        href={process.env.NEXT_PUBLIC_WEBSITE_URL || 'https://epc.vet'}
        className="client-app-website-link client-app-sidebar-website-link"
      >
        ← Back to website
      </a>
      <button type="button" className="client-app-sidebar-logout" onClick={logout}>
        Log out
      </button>
    </aside>
  );
}
