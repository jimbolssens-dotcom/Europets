-- Links a review request to the actual patient the visit was about (not
-- just the owning client), and requires 1-2 photos with every submitted
-- review — see app/(admin)/patients/[id]'s "Request a Review" (replacing
-- the one that used to live on the client page) and
-- website/app/reviews/submit/[id].
alter table review_requests
  add column if not exists patient_id uuid references patients(id);

alter table review_requests
  add column if not exists photo_urls text[] not null default '{}';

create index if not exists idx_review_requests_patient on review_requests(patient_id);
