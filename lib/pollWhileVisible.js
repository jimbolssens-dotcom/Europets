// lib/pollWhileVisible.js
// Owner-facing pages (client app, hospitalization portal) can't use live
// updates: the anon key they run on can't read the live tables (migration
// 191), and they have no staff login to get the staff token with. They
// refresh on a timer instead: every `ms` while the tab is visible, and at
// once when it comes back into view. Returns a cleanup function.

export function pollWhileVisible(load, ms) {
  const tick = () => {
    if (!document.hidden) load();
  };
  const timer = setInterval(tick, ms);
  const onVisible = () => {
    if (!document.hidden) load();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

// For a setState updater: keep the previous value when nothing changed, so
// a refresh that brings nothing new doesn't re-render (or, on a chat,
// scroll the thread back to the bottom).
export function keepIfSame(prev, next) {
  return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}
