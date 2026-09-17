// app/_components/ClientAppNav.jsx
// Fixed bottom tab bar for the logged-in client-app pages (Home/Pets/
// Reports/Invoices/Appointments) — hidden entirely until someone's logged
// in (see useClientAppSession), since the phone-entry screen itself has
// nothing to navigate to yet.

'use client';

import { usePathname } from 'next/navigation';
import { useClientAppSession } from './useClientAppSession';
import HexIcon from './HexIcon';

const TABS = [
  { href: '/client-app', label: 'Home', icon: '🏠' },
  { href: '/client-app/pets', label: 'Pets', icon: '🐾' },
  { href: '/client-app/reports', label: 'Reports', icon: '🩻' },
  { href: '/client-app/invoices', label: 'Invoices', icon: '🧾' },
  { href: '/client-app/appointments', label: 'Visits', icon: '📅' },
];

export default function ClientAppNav() {
  const { clientId, ready } = useClientAppSession();
  const pathname = usePathname();

  if (!ready || !clientId) return null;

  return (
    <nav className="client-app-nav">
      {TABS.map((tab) => (
        <a
          key={tab.href}
          href={tab.href}
          className={`client-app-nav-item${pathname === tab.href ? ' client-app-nav-item-active' : ''}`}
        >
          <HexIcon>{tab.icon}</HexIcon>
          <span>{tab.label}</span>
        </a>
      ))}
    </nav>
  );
}
