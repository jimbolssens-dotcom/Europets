-- Migration 157: Policies & Procedures entry explaining how staff should
-- log Old System Payments vs. Online Payments vs. an ordinary invoice
-- payment — three different flows that are easy to confuse, especially
-- now that both of the first two share one sequence number (migration
-- 156).
--
-- Run this in your Supabase SQL editor. Safe to run more than once (it
-- checks for an existing policy with this exact title under Payment &
-- Billing before inserting, so re-running doesn't create a duplicate).

insert into policies (category_id, title, sort_order, content)
select id, 'Logging a Payment: Which of the Three Flows to Use', 3, $policy$Purpose: There are THREE different places a payment can be logged in this app — using the wrong one either misses a step (client thinks they've paid, invoice still shows unpaid) or creates confusion in the accounting log. Use this to pick the right one every time.

1. ORDINARY INVOICE PAYMENT (the normal case — almost every payment)
   Where: directly on the invoice itself ("Add Payment").
   When: a client pays cash, card, bank transfer, or payment link for a specific invoice that's already open in front of them (or being closed out) — the normal checkout flow for a consult, hospitalization, or day procedure.
   What it does: marks that invoice as paid/partially paid immediately. This is what "Payment Collection at Checkout" (above) describes.

2. ONLINE PAYMENTS (Accounting → Online Payments)
   Where: Accounting → Online Payments → "+ New Payment".
   When: money arrives via Nomod, PayMob, PayPal, or a bank transfer that ISN'T tied to one specific invoice yet — e.g. a client sends a bank transfer for "whatever they owe" without saying which invoice, or pays through a payment link before staff have opened the matching invoice.
   Steps:
     a. Log the payment (donor/payer name, amount, source, date).
     b. Immediately after, use "Apply / View" on that payment to search for the client and apply the money to the correct invoice(s) — a payment left unapplied doesn't mark anything as paid.
   Every payment logged here gets a sequence number (the # column) — reference it when talking about "payment #26-09-07" so everyone means the exact same payment.

3. OLD SYSTEM PAYMENTS (a client's own page → "Old system balance")
   Where: open the CLIENT's own page, find "Old system balance," and use "Record Payment" there (not Accounting).
   When ONLY: a client is paying down a balance they carried over from before this app was used — never for a current invoice. If the client doesn't have an old-system balance showing on their page, this is the wrong flow.
   What it does: logs the payment AND reduces that client's carried-over balance by the same amount. Pick the correct Origin (how it was actually paid) from the dropdown — add a new one from that same form if it's not listed yet.
   These also get a sequence number (# column, visible on Accounting → Old System Payments), drawn from the SAME running sequence as Online Payments — so a number always identifies one specific payment no matter which of these two lists it's in.

Correcting a mistake:
   Both Online Payments and Old System Payments have Edit and Delete on Accounting → Online Payments / Old System Payments — use these to fix a wrong amount, date, or origin rather than logging a second, correcting entry. Editing or deleting an Old System Payment automatically adjusts the client's old-system balance to match; editing or deleting an Online Payment that's already been applied to an invoice is blocked from dropping the amount below what's applied (remove the applied amount first if it's a genuine correction that size).

Notes: If in doubt which of the three applies, ask before logging it somewhere wrong — a payment logged as "Old System" when it wasn't reduces a balance that shouldn't have moved, and a payment left unapplied in Online Payments leaves an invoice looking unpaid even though the money's already in.$policy$
from policy_categories
where name = 'Payment & Billing'
  and not exists (
    select 1 from policies
    where category_id = policy_categories.id
      and title = 'Logging a Payment: Which of the Three Flows to Use'
  );
