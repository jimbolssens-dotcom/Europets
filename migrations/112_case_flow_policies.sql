-- Migration 112: Clinical Case Records & Booking Workflow
--
-- A new Policies & Procedures category covering how a consult, a day
-- procedure, and a hospital admission link together as one patient's care
-- moves between them — which button to press for each transition, and
-- (companion piece) exactly what the system now carries over automatically
-- between linked records (vitals, reports) versus what stays deliberately
-- separate (invoices between an admission and any day procedure booked off
-- it, per the clinic's own billing preference).
--
-- Written alongside the fix that made weight/temperature readings and every
-- report type (diagnostics, dental, surgical, ultrasound, x-ray) merge
-- live across linked hospitalizations rows — see
-- lib/hospitalizationVitalsSync.js and lib/caseReportScope.js.

insert into policy_categories (name, sort_order) values
    ('Clinical Case Records & Booking Workflow', 8);

insert into policies (category_id, title, sort_order, content)
select id, 'Booking Mechanisms: Consult, Day Procedure & Hospitalization Transitions', 1, $policy$Purpose: A patient's care can move between a consult, a day procedure, and a full hospital admission — sometimes more than once in one stay. Booking each transition the correct way keeps one patient's care as one connected case instead of scattered records, and keeps vitals and reports flowing automatically instead of being re-typed. This is the "which button do I press" guide — see "How Records Link: Reports, Vitals & Invoices Across a Case" for exactly what the system does automatically once you do.

Overview — the three record types:
- A Consult is a single visit.
- A Day Procedure and a Hospital Admission are the SAME kind of record under the hood, just flagged differently — a day procedure is for a same-day drop-off/pick-up, an admission is for an overnight or multi-day stay. Both live on the Hospitalization page and both get their own worksheet, Day Treatment Plan, and Reports section.

Steps — pick the scenario that matches:

1. A walk-in or consult needs surgery/a procedure THE NEXT DAY (not today):
   - Admit the patient tonight as a full Hospital Admission — this is the correct way to track the overnight stay itself (cage, vitals, worksheet).
   - Do not try to create a Day Procedure record for tomorrow in advance. Day procedures are always same-day and have no "scheduled for a future date" field — one created today would just sit open and eventually get flagged as overdue.
   - The next morning, once the procedure is actually happening, click "Book Day Procedure" on that still-open admission. This creates the procedure's own record at the right moment, linked back to last night's admission.

2. A consult turns into a hospitalization or day procedure THE SAME DAY:
   - From the consult page, start a day procedure (for a same-day, go-home-today case) or admit to a full stay, whichever fits.
   - This is the normal, correct path. The new record is linked to the consult automatically, the consult's invoice is adopted as the one invoice for the whole case rather than a second one being opened, and everything already entered during the consult (reports, diagnostics) already shows on the new record's own Reports section — nothing to copy over by hand.

3. A patient who is ALREADY ADMITTED needs an unplanned, same-day procedure (e.g. an inpatient needs a dental done today):
   - On the open admission, click "Book Day Procedure." This deliberately creates a SECOND record for the same patient — the admission stays open in parallel so the overnight stay keeps being tracked normally, while the procedure gets its own dedicated worklist and its own consent form.
   - Vitals (weight/temperature) and every report type entered on either record now automatically show on both, live — a temperature taken on the admission this morning already appears on the day procedure's own vitals tile once it's created, and vice versa. Nothing needs to be re-typed.
   - Billing does NOT merge here, by clinic policy: the day procedure gets its own separate invoice from the admission's. Expect and check out two invoices for that stay in this scenario, not one — mention this to the client so they're not surprised at checkout.

4. A day procedure patient needs to be kept overnight after all:
   - On the day procedure's own page, click "Move to Hospital." This is a simple, safe upgrade of that SAME record — no new record is created, nothing needs to be re-linked, and every report, vitals reading, and invoice item already on it stays exactly where it is.
   - This is different from #3 above: here there was only ever one record, and it's just being reclassified from "day procedure" to "admission" in place.

5. Multiple transitions in one stay (e.g. admitted, then a same-day procedure booked off it, then that procedure itself needs to become an overnight stay):
   - Each individual transition still follows the rules above: "Book Day Procedure" always creates a new linked record; "Move to Hospital" always upgrades a record in place — never both at once.
   - Before clicking "Book Day Procedure" again, check whether the case genuinely needs a separate, distinct billing/consent record, or whether it's simpler to keep working directly on the original open admission. Every extra "Book Day Procedure" means another invoice at checkout — don't create one just to feel organized if the work could stay on the existing record.
   - Look for the linked-records shown near the top of the Hospitalization page (e.g. "Booked from admission" / "Day procedures booked off this admission") to see the whole family of related records for a case at a glance, from any one of them.

Notes: If you're ever unsure whether a reading or report actually saved where you expect, check the linked records shown on the page — reports and vitals now show up on every record in the same family, but each one is still physically stored against the record it was entered on. Deleting a record does not delete its linked siblings, only itself and its own entries.$policy$
from policy_categories where name = 'Clinical Case Records & Booking Workflow';

insert into policies (category_id, title, sort_order, content)
select id, 'How Records Link: Reports, Vitals & Invoices Across a Case', 2, $policy$Purpose: Explain exactly what carries over automatically between a linked consult, day procedure, and hospitalization, and what stays deliberately separate — so nobody re-types a reading that's already there, and nobody is surprised by how invoices land at checkout.

Overview — how records link:
- Consult to Day Procedure/Admission: the new record remembers which consult it came from.
- Admission to a spun-off Day Procedure ("Book Day Procedure"): the day procedure remembers which admission it was booked off, and the admission stays open at the same time — this is the only case where a patient can have two open hospitalization records at once.
- Day Procedure to Admission ("Move to Hospital"): no new record at all — the same record's type is simply flipped in place.

What automatically carries over between linked records (no manual re-entry needed):
- Weight and temperature readings: logging either one on any linked record automatically mirrors it onto every other linked, still-open record, and marks that record's own Day Treatment Plan tile as done too.
- Every report type — lab/diagnostic test orders and results, dental reports, surgical reports, ultrasound reports, and x-ray reports: each linked record's Reports section shows the combined, merged set from itself and its linked records. A report is still only ever physically stored on the one record it was created on — this is a live, read-only merge for display, not a copy, so nothing is ever duplicated.
- A consult's invoice: when a consult becomes a hospitalization, its existing invoice is reused rather than a second one being opened, and billable items from both the consult and the hospitalization land on that one invoice.

What stays deliberately separate:
- Invoices between an admission and any day procedure booked off it: each gets its own invoice. This is a clinic billing decision, not a technical limitation — a same-day procedure booked off an open admission is billed as its own ticket. Front desk/accounting should expect to collect on both invoices separately for that stay.
- A reading or report is still only ever entered once, on whichever record you're actually working from — the system shows it everywhere relevant on its own; there is no separate "sync" step or button to press.

Notes: This merging only ever runs one hop in each direction — a record's direct parent and its direct children — it does not chase multi-generation chains beyond that. In the normal booking flows described in "Booking Mechanisms: Consult, Day Procedure & Hospitalization Transitions," that's always enough to cover the whole case.$policy$
from policy_categories where name = 'Clinical Case Records & Booking Workflow';
