-- 035_staff_color.sql
-- Lets each staff member (vets, in practice) have a chosen color instead
-- of the auto-assigned palette on the Appointments schedule — set on the
-- Staff page. Null means "no custom color yet", so the appointments page
-- falls back to its existing auto-assigned palette for that staff member.

alter table staff
    add column if not exists color text;

alter table staff disable row level security;
