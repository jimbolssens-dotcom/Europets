# Europets — Vet Clinic Management System

Next.js + Supabase app for managing a multi-room vet clinic: clients, patients,
appointments, full consult medical records, hospitalization, and invoicing.

## Stack
- **Frontend + Backend**: Next.js (App Router) — API routes double as the backend.
- **Database**: Supabase (hosted Postgres) with realtime subscriptions, auth, and
  an auto-generated client.
- **File storage**: Supabase Storage (`consult-files` bucket) for diagnostic
  and report attachments (X-rays, lab PDFs, photos, etc.) and recorded audio.
- **Hosting**: Vercel (app) + Supabase (database + storage).
- **AI**: [AssemblyAI](https://www.assemblyai.com/) for speech-to-text and
  [Claude](https://claude.com) (`claude-opus-5`, via `@anthropic-ai/sdk`) for
  summarizing consult/surgery recordings into clinical notes.

## Getting started
1. Install dependencies:
   ```
   npm install
   ```
2. Create a free project at [supabase.com](https://supabase.com), then run
   `schema.sql` in its SQL editor. This creates the tables, the
   `consult-files` storage bucket + policies, the realtime-changes
   publication the app relies on, and leaves RLS disabled (see note below).
3. Copy `.env.local.example` to `.env.local` and fill in your Supabase project
   URL and publishable key (Project Settings → API Keys), plus (optional,
   only needed for the audio-recording feature) an `ANTHROPIC_API_KEY`
   from [console.anthropic.com](https://console.anthropic.com) and an
   `ASSEMBLYAI_API_KEY` from [assemblyai.com](https://www.assemblyai.com/).
   Both are server-side only — never prefix them with `NEXT_PUBLIC_`.
4. Run the dev server:
   ```
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000).

> **Security note:** RLS is intentionally left disabled — there's no staff
> auth yet, and the app talks to Supabase directly with the publishable key.
> Add auth and RLS policies before this holds real client data.

> **Audio recording only works on a publicly reachable deployment.**
> AssemblyAI transcribes asynchronously and calls back a webhook
> (`/api/recordings/:id/webhook`) built from the request's own origin —
> that has to be reachable from the internet, so recording will start fine
> on `localhost` but the transcript/summary will never arrive until you're
> running on your real Vercel URL (or a tunnel like ngrok).

> **Env var naming:** the app reads `NEXT_PUBLIC_SUPABASE_APP_URL` /
> `NEXT_PUBLIC_SUPABASE_APP_KEY`, not the more obvious
> `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY`. That's deliberate — if you ever
> connect Vercel's Supabase marketplace integration to this project, it
> auto-injects env vars under those exact common names for whatever
> project *it* provisions, silently overriding a manually-configured
> Supabase project of your own. The app-specific names sidestep that.

## Build phases
1. ✅ Clients & Patients database
2. ✅ Appointments (15-min consult / 10-min surgery increments, conflict checked)
3. ✅ Consults — full medical record (vitals, anamnesis, findings, prognosis),
   real-time notes, diagnostics with file attachments, a treatment plan drawn
   from the catalog, and surgical/dental reports
4. ✅ Goods/services & invoicing (flat + per-kg pricing, 5% UAE VAT)
5. ✅ Hospitalization — standalone multi-day admissions with a day-to-day
   worksheet, startable from a consult
6. ✅ AI layer — record a consult or surgery in the browser, AssemblyAI
   transcribes it, Claude summarizes it, and the summary is folded into
   consult notes / the surgical report automatically
7. FileMaker migration

## Folder layout
```
app/
├── api/
│   ├── clients/route.js, patients/route.js, rooms/route.js, staff/route.js
│   │                                     → core CRUD (each has a [id] route too)
│   ├── appointments/route.js             → booking (list/create)
│   ├── appointments/[id]/route.js        → status updates (check-in, cancel, ...)
│   ├── visits/route.js                   → start a consult (from appointment or walk-in)
│   ├── visits/[id]/route.js              → consult record (GET/PATCH), completing
│   ├── consult-notes/route.js            → per-consult live note thread
│   ├── diagnostics/, treatment-items/    → per-consult diagnostics & treatment plan
│   ├── surgical-reports/, dental-reports/ → per-consult advanced-treatment reports
│   ├── hospitalizations/                 → admissions + day-to-day worksheet notes
│   ├── attachments/                      → file metadata (files live in Storage)
│   ├── recordings/route.js               → save an uploaded recording + submit for transcription
│   ├── recordings/[id]/webhook/route.js  → AssemblyAI callback → Claude summary → notes/report
│   ├── goods-services/route.js           → catalog CRUD
│   ├── invoices/route.js                 → list/open invoices
│   └── invoices/[id]/line-items/         → add/remove invoice line items
├── clients/, patients/                   → list, detail, edit/delete
├── appointments/                         → month calendar + room x time schedule
├── consults/                             → active/completed board + full consult record
├── hospitalization/                      → admissions list + day-to-day worksheet
├── invoices/, catalog/                   → invoicing UI
├── rooms/, staff/                        → admin list, edit/delete
├── _components/AttachmentSection.jsx     → reusable file upload/list widget
├── _components/AudioRecorder.jsx         → record/upload audio, show transcript+summary
└── layout.js, page.js                    → app shell & home page
lib/
├── supabaseClient.js                     → shared Supabase connection
├── attachments.js                        → client-side Storage upload helper
├── recordings.js                         → client-side recording upload helper
├── assemblyai.js                         → server-side AssemblyAI REST calls
├── anthropicClient.js                    → server-side Claude summarization
└── invoicing.js                          → subtotal/VAT/total calculation
schema.sql                                → full database schema
migrations/                               → incremental SQL for already-deployed databases
```
