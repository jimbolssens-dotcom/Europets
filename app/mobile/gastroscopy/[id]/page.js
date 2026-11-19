// app/mobile/gastroscopy/[id]/page.js
// Old link to a phone gastroscopy report: the report now opens on the shared
// phone scan page (app/mobile/scan/[kind]/[id]), with the same card as
// on desktop. Kept so links already sent or bookmarked still work.

import { redirect } from 'next/navigation';

export default function MobileGastroscopyReportRedirect({ params }) {
  redirect(`/mobile/scan/gastroscopy/${params.id}`);
}
