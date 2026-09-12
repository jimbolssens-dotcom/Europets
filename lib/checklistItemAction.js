// lib/checklistItemAction.js
// Classifies a day procedure's checklist item (hospitalization_plan_items
// row) into what confirming it "done" should do — shared by the desktop
// Procedure Checklist (app/_components/ProcedureChecklist.jsx, which turns
// this into an anchor link on the same page) and the mobile Day Procedure
// checklist (app/mobile/day-procedures/[id]/page.js, which turns this into
// navigation to another screen or an auto-created report). Same
// name-matching helpers used elsewhere for this (isDentalProduct etc.).
//
// 'spay_neuter' and 'surgery' both auto-create a surgical_reports row the
// moment the item is confirmed done (see lib/surgicalReportAuto.js) — a
// standard spay/neuter needs no dictation at all (its report is filled in
// straight from the clinic's own Post-Op Care Baseline), while any other
// surgery still gets dictated, just with the report row already waiting.
//
// A generic "surgery" (a fracture repair, mass removal, amputation, ...)
// rarely matches a catalog item cleanly, so it can't rely on name/
// subcategory matching the way dental/xray/vaccine/spay-neuter do —
// item.is_surgical (migration 091) is set directly by the AI dictation
// extraction, or by staff via the checklist's Custom Item/edit form, and
// is checked first for exactly that reason.

import { isDentalProduct } from './dentalProduct';
import { isSpayNeuterProduct } from './spayNeuterProduct';
import { isVaccineProduct } from './vaccineProduct';
import { isXrayTest } from './xrayProduct';
import { isUltrasoundTest } from './ultrasoundProduct';

export function checklistItemAction(item, catalog, subcategories = []) {
  const catalogItem = catalog.find((c) => c.id === item.goods_service_id);
  const name = catalogItem?.name || item.label || '';

  if (isDentalProduct(name)) return 'dental';
  if (isXrayTest(name)) return 'xray';
  if (isUltrasoundTest(name)) return 'ultrasound';
  if (isVaccineProduct(name)) return 'vaccine';
  if (isSpayNeuterProduct(name)) return 'spay_neuter';
  if (catalogItem?.main_category === 'test') return 'test';
  if (item.is_surgical) return 'surgery';

  // Loose ("contains", not exact-match) so a clinic's own differently
  // named surgical subcategories (e.g. "Orthopedic Surgery", "Soft
  // Tissue Surgeries") still count, not just the seeded "Surgeries" one.
  const subcategory = subcategories.find((s) => s.id === catalogItem?.subcategory_id);
  if (catalogItem?.main_category === 'service' && /surger/i.test(subcategory?.name || '')) return 'surgery';

  return null;
}
