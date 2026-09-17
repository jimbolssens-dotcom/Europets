-- migrations/118_client_app_theme.sql
-- Lets the clinic (not each client) pick which look the client-app
-- (app/client-app) renders for everyone: the dark "Hexfield" theme or the
-- original plain light theme — see app/client-app/layout.js and
-- globals.css's "CLIENT APP" section for how the value is read and
-- applied. Editable from the Settings page.

alter table clinic_settings
  add column if not exists client_app_theme text not null default 'dark'
    check (client_app_theme in ('dark', 'light'));
