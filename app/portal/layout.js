// app/portal/layout.js
// Client-facing pages. Deliberately outside app/(admin) so none of the
// internal staff nav (links into every client's/patient's data — this app
// has no login system) ever renders here. noindex since these links are
// meant to be shared privately, one per hospitalization, not discovered.

export const metadata = {
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }) {
  return <div className="portal">{children}</div>;
}
