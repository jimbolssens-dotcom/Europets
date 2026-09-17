// app/_components/ClientAppShell.jsx
// Renders the .client-app root div with data-theme set from
// ClientAppThemeContext — must be mounted inside <ClientAppThemeProvider>.
// Split out from layout.js because layout.js stays a Server Component
// (it's where the next/font Google fonts are loaded) and can't itself
// call the theme hook.

'use client';

import { useClientAppTheme } from './ClientAppThemeContext';

export default function ClientAppShell({ children }) {
  const theme = useClientAppTheme();
  return (
    <div className="client-app" data-theme={theme}>
      {children}
    </div>
  );
}
