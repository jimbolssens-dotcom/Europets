-- 201_social_media_consent.sql
-- Whether the owner lets the clinic share photos and videos of their pets
-- on Instagram and Facebook. Asked as a tick on the intake form and on
-- every consent form (lib/socialConsent.js), and settable by staff on the
-- client page. null = never asked; the Social page (to come) only lets a
-- patient be posted once this is true.

alter table clients add column if not exists social_media_consent boolean;
alter table clients add column if not exists social_media_consent_at timestamptz;
alter table clients add column if not exists social_media_consent_source text;

alter table clients drop constraint if exists clients_social_media_consent_source_check;
alter table clients add constraint clients_social_media_consent_source_check
  check (social_media_consent_source is null
         or social_media_consent_source in ('intake', 'consent_form', 'staff', 'whatsapp'));

-- The intake form's answer, held until staff approve the request.
alter table intake_requests add column if not exists social_media_consent boolean;

-- The answer given with each signed consent form, for the record.
alter table consent_forms add column if not exists social_media_consent boolean;
