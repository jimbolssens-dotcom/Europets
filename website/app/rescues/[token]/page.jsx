// website/app/rescues/[token]/page.jsx
// The clinic's own page for a rescuer we support (epc.vet/rescues/<short
// name>): the photo page, linking to their Instagram and their links, with
// the same payment link as their own page (app/pay/[token]). Kept off
// until Jim says it goes live: RESCUE_PAGES_LIVE in lib/payLinkRules.js
// (RESCUE_PAGES_PREVIEW=1 shows it on a local or preview build).

import { notFound } from 'next/navigation';
import PayLinkView from '../../pay/[token]/PayLinkView';
import { RESCUE_PAGES_LIVE } from '@/lib/payLinkRules';

export const dynamic = 'force-dynamic';

export default function RescuePage() {
  if (!RESCUE_PAGES_LIVE && process.env.RESCUE_PAGES_PREVIEW !== '1') notFound();
  return <PayLinkView view="clinic" />;
}
