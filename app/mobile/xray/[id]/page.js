// app/mobile/xray/[id]/page.js
// Old link to a phone xray report: the report now opens on the shared
// phone scan page (app/mobile/scan/[kind]/[id]), with the same card as
// on desktop. Kept so links already sent or bookmarked still work.

import { redirect } from 'next/navigation';

export default function MobileXrayReportRedirect({ params }) {
  redirect(`/mobile/scan/xray/${params.id}`);
}
