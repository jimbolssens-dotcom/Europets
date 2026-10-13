-- Migration 180: Online Payments and Old System Payments numbered apart
--
-- Online Payments (donations) follow the clinic's own 2026 Master
-- Transfers sheet ("26-10-01" = the sheet's row 26-10-01), so the app and
-- the sheet use the same number for the same transfer. Old System
-- Payments get their own count with an OS in front ("OS-26-10-01"), so a
-- number still means exactly one payment (migration 156's point), just
-- without the two lists pushing each other's numbers up. See
-- lib/paymentSequence.js.
--
-- 1. Existing Old System Payment numbers get the OS prefix.
-- 2. Each OS month's counter continues after its highest number.
-- 3. Each Online Payments month's counter continues after its highest
--    donation_number (October continues after 26-10-22).
--
-- Safe to run more than once.

update legacy_payments
   set payment_number = 'OS-' || payment_number
 where payment_number ~ '^[0-9]{2}-[0-9]{2}-[0-9]+$';

insert into payment_sequence_counters (month_prefix, next_seq)
select left(payment_number, 8), max(split_part(payment_number, '-', 4)::integer) + 1
  from legacy_payments
 where payment_number ~ '^OS-[0-9]{2}-[0-9]{2}-[0-9]+$'
 group by left(payment_number, 8)
on conflict (month_prefix) do update
  set next_seq = greatest(payment_sequence_counters.next_seq, excluded.next_seq);

update payment_sequence_counters c
   set next_seq = coalesce((
         select max(split_part(d.donation_number, '-', 3)::integer)
           from donations d
          where left(d.donation_number, 5) = c.month_prefix
       ), 0) + 1
 where c.month_prefix ~ '^[0-9]{2}-[0-9]{2}$';
