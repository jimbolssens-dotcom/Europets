// lib/screenModeSwitch.js
// "Auto-switch with screen size": on a phone that folds (a Galaxy Fold),
// the narrow cover screen shows the mobile app (/mobile...) and the wide
// inner screen the desktop one, switching the moment it's folded or
// unfolded. Opt-in PER DEVICE (localStorage), off by default everywhere,
// so staff phones that switch between the two by hand are never touched.
// See app/_components/AutoScreenSwitcher.jsx.

export const AUTO_SWITCH_KEY = 'europets-auto-switch-screen';

// Wider than any phone held upright, narrower than an unfolded Fold.
export const WIDE_SCREEN_QUERY = '(min-width: 700px)';

export function autoSwitchEnabled() {
  try {
    return window.localStorage.getItem(AUTO_SWITCH_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setAutoSwitch(on) {
  try {
    if (on) window.localStorage.setItem(AUTO_SWITCH_KEY, 'on');
    else window.localStorage.removeItem(AUTO_SWITCH_KEY);
  } catch {
    // Private mode / blocked storage: the switch just stays off.
  }
  window.dispatchEvent(new Event('europets-auto-switch-changed'));
}

// The same page on the desktop side, for a mobile path. Pages with no
// desktop twin go to the desktop home.
export function desktopPathFor(mobilePath) {
  const p = mobilePath.replace(/\/+$/, '') || '/mobile';
  let m;
  if ((m = p.match(/^\/mobile\/messages\/([^/]+)$/))) return `/messages/${m[1]}`;
  if ((m = p.match(/^\/mobile\/consults\/([^/]+)$/))) return `/consults/${m[1]}`;
  if ((m = p.match(/^\/mobile\/(?:hospitalization|day-procedures)\/([^/]+)(?:\/.*)?$/))) return `/hospitalization/${m[1]}`;
  if (p === '/mobile/messages') return '/messages';
  if (p === '/mobile/consults') return '/consults';
  if (p === '/mobile/hospitalization') return '/hospitalization';
  if (p === '/mobile/day-procedures') return '/day-procedures';
  if (p === '/mobile/appointments' || p === '/mobile/schedule') return '/appointments';
  return '/';
}

// The same page on the mobile side, for a desktop path. Pages with no
// mobile twin go to the mobile home.
export function mobilePathFor(desktopPath) {
  const p = desktopPath.replace(/\/+$/, '') || '/';
  let m;
  if ((m = p.match(/^\/messages\/([^/]+)$/))) return `/mobile/messages/${m[1]}`;
  if ((m = p.match(/^\/consults\/([^/]+)$/))) return `/mobile/consults/${m[1]}`;
  if ((m = p.match(/^\/hospitalization\/([^/]+)$/)) && !['cages', 'wall'].includes(m[1])) return `/mobile/hospitalization/${m[1]}`;
  if (p === '/messages') return '/mobile/messages';
  if (p === '/consults') return '/mobile/consults';
  if (p === '/hospitalization') return '/mobile/hospitalization';
  if (p === '/day-procedures') return '/mobile/day-procedures';
  if (p === '/appointments') return '/mobile/appointments';
  return '/mobile';
}

// Which side a path is on; null for pages the switcher leaves alone
// (logins, client-facing pages, wall screens).
export function sideOf(path) {
  if (path === '/mobile' || path.startsWith('/mobile/')) return 'mobile';
  if (/^\/(client-app|portal|login|accounting-login|intake|consent|review)/.test(path)) return null;
  if (/\/wall$/.test(path)) return null;
  return 'desktop';
}
