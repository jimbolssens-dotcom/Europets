-- migrations/092_clinic_settings_staff_pincode.sql
-- Lets staff rotate the shared staff PIN from the Accounting page instead
-- of editing the STAFF_PINCODE environment variable and redeploying. Null
-- means "no override yet" — middleware.js and the login route fall back to
-- the environment variable in that case, so a fresh deploy still boots
-- with a working PIN before anyone has set one here.

alter table clinic_settings add column if not exists staff_pincode text;
