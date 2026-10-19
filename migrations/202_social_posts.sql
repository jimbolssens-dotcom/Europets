-- 202_social_posts.sql
-- The Social page (app/(admin)/social): staff upload real photos and videos,
-- the AI drafts Instagram and Facebook captions from them
-- (lib/socialDraft.js), and a staff member approves the post. Until Meta is
-- connected, an approved post is copied and posted by hand, then marked as
-- posted here.
--
-- The files themselves go to the consult-files bucket under social/<id>/
-- (public URLs, which Meta's publishing API will need later). `media` lists
-- them in order: [{ path, kind: 'image'|'video', preview_path, name,
-- excluded, note }]. The AI's own captions are kept next to the final ones
-- so staff edits can teach it the clinic's voice.

create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'new',
  title text,
  story text,
  patient_id uuid references patients(id) on delete set null,
  created_by uuid references staff(id) on delete set null,
  media jsonb not null default '[]'::jsonb,
  cover_index integer not null default 0,
  caption_instagram text,
  caption_facebook text,
  ai_caption_instagram text,
  ai_caption_facebook text,
  ai_notes text,
  ai_error text,
  approved_by uuid references staff(id) on delete set null,
  approved_at timestamptz,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table social_posts drop constraint if exists social_posts_status_check;
alter table social_posts add constraint social_posts_status_check
  check (status in ('new', 'draft', 'approved', 'posted', 'discarded'));

create index if not exists social_posts_status_created_idx on social_posts (status, created_at desc);
create index if not exists social_posts_patient_id_idx on social_posts (patient_id);
create index if not exists social_posts_created_by_idx on social_posts (created_by);
create index if not exists social_posts_approved_by_idx on social_posts (approved_by);

-- Server-only: read and written through app/api/social-posts with the
-- service-role key, never the public key.
alter table social_posts enable row level security;
