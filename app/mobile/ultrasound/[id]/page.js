// app/mobile/ultrasound/[id]/page.js
// Old link to a phone ultrasound report: the report now opens on the shared
// phone scan page (app/mobile/scan/[kind]/[id]), with the same card as
// on desktop. Kept so links already sent or bookmarked still work.

import { redirect } from 'next/navigation';

export default function MobileUltrasoundReportRedirect({ params }) {
  redirect(`/mobile/scan/ultrasound/${params.id}`);
}
