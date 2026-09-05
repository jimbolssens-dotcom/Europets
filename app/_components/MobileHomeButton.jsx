// app/_components/MobileHomeButton.jsx
// Fixed top-right "go home" button shown on every mobile follow-through
// screen, replacing the old inline "← Record" / "← Consults" style back
// links (and, on the cleaner's hospitalization/schedule pages, the
// persistent Hospital/Staff Roster tab bar — see MobileCleanerTabs) with
// one consistent action in the same spot everywhere. Wrap it in
// .mobile-corner-actions yourself on a page that also needs an extra
// contextual icon alongside it (see app/mobile/hospitalization/[id]/
// page.js) — this component only renders the button itself.

export default function MobileHomeButton() {
  return (
    <a href="/mobile" className="mobile-corner-btn" title="Home" aria-label="Home">
      🏠
    </a>
  );
}
