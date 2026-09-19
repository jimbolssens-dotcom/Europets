// lib/microphoneAccess.js
// Turns a getUserMedia() rejection into a message staff can actually act
// on. "NotAllowedError" almost never means someone consciously tapped
// "Don't Allow" — on iPhone/iPad it's the same error iOS throws when a
// page was opened from a Home Screen icon (a standalone web app, which
// this whole site is installable as — see app/layout.js's manifest/
// appleWebApp metadata): iOS's standalone web view has never reliably
// granted microphone access the way an ordinary Safari tab does, with or
// without a prior "Allow" tap. That's the single most common real-world
// cause of this error report, so it's worth naming explicitly rather than
// leaving staff to guess between a permissions problem and a broken mic.
export function isStandaloneWebApp() {
  if (typeof window === 'undefined') return false;
  return window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

export function describeMicrophoneError(err) {
  if (err?.name === 'NotAllowedError' && isStandaloneWebApp()) {
    return (
      'Could not access microphone — this can\'t be granted from the Home Screen icon on iPhone/iPad. ' +
      'Open this page in Safari itself (not the installed icon) to record.'
    );
  }
  return `Could not access microphone: ${err?.message || err}`;
}
