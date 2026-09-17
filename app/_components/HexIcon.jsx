// app/_components/HexIcon.jsx
// The "hex plate" device used throughout the client app's dark Hexfield
// theme — a gradient-bordered hexagon with a dark face behind an emoji/
// glyph (see the CSS vars/classes in globals.css, "client-app-hex-plate").
// In the light theme (the original, pre-Hexfield design — see
// ClientAppThemeContext) this renders as a plain emoji instead, no plate:
// the light theme deliberately drops every hex-shaped device, not just
// the colors.

'use client';

import { useClientAppTheme } from './ClientAppThemeContext';

export default function HexIcon({ children, className = '' }) {
  const theme = useClientAppTheme();

  if (theme === 'light') {
    return <span className={`client-app-plain-icon ${className}`}>{children}</span>;
  }

  return (
    <span className={`client-app-hex-plate ${className}`}>
      <span className="client-app-hex-face">{children}</span>
    </span>
  );
}
