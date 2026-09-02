// app/mobile/layout.js
// Staff-facing, phone-first pages for recording on the go: pick a
// consult from today's appointments or a cage from the hospitalization
// list, then just tap record. Deliberately outside app/(admin) — no
// desktop nav, single column, large tap targets — but still internal
// (this app has no login system, same as every other staff page).

export const metadata = {
  robots: { index: false, follow: false },
};

export default function MobileLayout({ children }) {
  return <div className="mobile-app">{children}</div>;
}
