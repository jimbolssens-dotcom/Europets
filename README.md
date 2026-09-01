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
  summarizing consult/surgery recordings into clinical notes, and for
  reading name + ID number off a photo of an Emirates ID card.

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

> **Full consult/surgery recording only works on a publicly reachable
> deployment.** AssemblyAI transcribes it asynchronously and calls back a
> webhook (`/api/recordings/:id/webhook`) built from the request's own
> origin — that has to be reachable from the internet, so recording will
> start fine on `localhost` but the transcript/summary will never arrive
> until you're running on your real Vercel URL (or a tunnel like ngrok).
> The per-field 🎤 dictation buttons don't have this limitation — they
> transcribe synchronously within the request, so they work on `localhost`
> too.

> **"Share via WhatsApp" is a manual hand-off, not automated sending.**
> A website has no way to attach a file to a WhatsApp chat and hit send on
> its own — that needs the paid WhatsApp Business API (Meta business
> verification, approved message templates, per-message cost). The
> "Download Summary PDF" / "Share via WhatsApp" buttons on a hospitalization
> page instead: download the PDF, then open `wa.me` with the client's
> number and a drafted message — the vet still taps the attach icon in
> WhatsApp once to pick the file they just downloaded.

> **Emirates ID scanning reads text, it doesn't crop a face photo.** Claude
> reads the name and ID number off the card photo and fills in the form;
> it can't isolate just the small printed photo on the card into a
> separate "client photo" field. Instead, the whole card photo you scanned
> gets saved as a regular attachment on the client (visible on their
> detail page under "Emirates ID") — so the photo is on file, just as a
> full card scan rather than a cropped headshot.

> **Fill in Settings before relying on Tax Invoices.** The clinic's legal
> name/TRN/address on every generated Tax Invoice PDF come from the
> Settings page (`/settings`) — it starts with a placeholder legal name and
> no TRN. Every invoice is assumed standard-rated at 5% (the only rate a
> UAE vet clinic normally deals with); there's no per-item VAT rate or
> zero-rated/exempt handling if that's ever needed.

> **The client portal's security model is "unguessable link," not login.**
> `/portal/hospitalization/[id]` has no auth check — it's reachable by
> anyone with the link. That's deliberate and matches the rest of this
> app (no staff auth either), and the id is a random UUID (not the
> sequential, guessable admission number shown to staff), so it's not
> discoverable without being sent the link. What it actually protects
> against is different: the portal route is **outside** `app/(admin)`,
> which is the group that carries the internal staff nav — so a client
> who opens their portal link can't navigate into `/clients`, `/invoices`,
> or any other page and see other people's data, the way they could if
> the portal reused the regular app shell. Any new client-facing page
> must go under `app/portal/`, never `app/(admin)/`, for the same reason.

> **Env var naming:** the app reads `NEXT_PUBLIC_SUPABASE_APP_URL` /
> `NEXT_PUBLIC_SUPABASE_APP_KEY`, not the more obvious
> `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY`. That's deliberate — if you ever
> connect Vercel's Supabase marketplace integration to this project, it
> auto-injects env vars under those exact common names for whatever
> project *it* provisions, silently overriding a manually-configured
> Supabase project of your own. The app-specific names sidestep that.

## Build phases
0. ✅ Global search — a search box in the nav (live dropdown as you type,
   or a full results page) finds clients by name/phone and patients by
   name/breed/microchip number. The Clients and Patients pages themselves
   are search-first too: search + add sit side by side, and no list loads
   until you search — it doesn't dump the entire, ever-growing table
1. ✅ Clients & Patients database
2. ✅ Appointments (15-min consult / 10-min surgery increments, conflict checked)
3. ✅ Consults — full medical record (vitals, anamnesis, findings, prognosis),
   real-time notes, diagnostics with file attachments, a treatment plan drawn
   from the catalog, and surgical/dental reports
4. ✅ Goods/services & invoicing (flat + per-kg pricing, 5% UAE VAT) — a
   consult can open an invoice that imports its whole treatment plan as
   line items in one click, then take more items added afterward.
   UAE FTA-compliant Tax Invoice PDFs: sequential invoice numbering, the
   clinic's own TRN (Settings page), and the client's TRN if they're a
   VAT-registered business
5. ✅ Hospitalization — standalone multi-day admissions with a day-to-day
   worksheet, startable from a consult, with photo capture (camera button
   on iPad/phones) and a one-click PDF summary — including the case's and
   each day's photos — to share with the client. A "Share Client Portal
   Link" button sends a live, read-only, client-facing page over WhatsApp
   (no PDF/attach step) that updates automatically until discharge
6. ✅ AI layer — record a consult or surgery in the browser, AssemblyAI
   transcribes it, Claude summarizes it, and the summary is folded into
   consult notes / the surgical report automatically. A small 🎤 button on
   individual fields (anamnesis, findings, treatment notes, surgical/dental
   notes) does the same for a short dictation, filling in just that field
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
│   ├── hospitalizations/[id]/summary-pdf → PDF summary for sharing with the client
│   ├── attachments/                      → file metadata (files live in Storage)
│   ├── recordings/route.js               → save an uploaded recording + submit for transcription
│   ├── recordings/[id]/webhook/route.js  → AssemblyAI callback → Claude summary → notes/report
│   ├── voice-to-text/route.js            → dictate one field: transcribe + summarize synchronously
│   ├── search/route.js                   → find clients/patients by name/phone/breed/microchip
│   ├── clients/scan-id/route.js          → read name + ID number off a photo of an Emirates ID
│   ├── goods-services/route.js           → catalog CRUD
│   ├── invoices/route.js                 → list/open invoices
│   ├── invoices/[id]/line-items/         → add/remove invoice line items
│   ├── visits/[id]/invoice/route.js      → create (or reuse) an invoice for a consult,
│   │                                        importing its treatment plan as line items
│   ├── invoices/[id]/tax-invoice-pdf/    → FTA-compliant Tax Invoice PDF for one invoice
│   └── clinic-settings/route.js          → the clinic's own TRN/identity (singleton row)
├── (admin)/                                → every internal staff page, wrapped in the staff nav
│   ├── layout.js                           → the nav (Clients, Patients, ... , ⚙️ Settings)
│   ├── page.js                             → home page
│   ├── search/                             → full results page for a nav search
│   ├── clients/, patients/                 → list, detail, edit/delete — Add Client can scan
│   │                                          an Emirates ID card to fill in name + ID number
│   ├── appointments/                       → month calendar + room x time schedule
│   ├── consults/                           → active/completed board + full consult record
│   ├── hospitalization/                    → admissions list + day-to-day worksheet; "Share
│   │                                          Client Portal Link" sends a live link over WhatsApp
│   ├── invoices/                           → list + create; invoices/[id] is a single invoice's page
│   ├── catalog/                            → catalog UI
│   ├── rooms/, staff/                      → admin list, edit/delete
│   └── settings/                           → clinic legal name/TRN/address for tax invoices
├── portal/                                 → client-facing pages — NO staff nav (see security
│   │                                          note above), noindex. Add new client-facing pages here.
│   ├── layout.js
│   └── hospitalization/[id]/               → live read-only view of one admission
├── _components/AttachmentSection.jsx     → reusable file upload/list widget (staff, w/ upload+delete)
├── _components/AttachmentGallery.jsx     → read-only file/photo gallery (client portal)
├── _components/SearchBox.jsx             → nav search box with a live results dropdown
├── _components/ScanIdButton.jsx          → camera button that reads an Emirates ID card
├── _components/AudioRecorder.jsx         → record/upload audio, show transcript+summary
├── _components/VoiceToTextButton.jsx     → small 🎤 button that dictates a single field
└── layout.js                             → bare root shell (html/body only — see security note)
lib/
├── supabaseClient.js                     → shared Supabase connection
├── attachments.js                        → client-side Storage upload helper
├── recordings.js                         → client-side recording upload helper
├── assemblyai.js                         → server-side AssemblyAI REST calls
├── anthropicClient.js                    → server-side Claude summarization
├── hospitalizationSummaryPdf.js          → builds the hospitalization summary PDF (pdf-lib)
├── taxInvoicePdf.js                      → builds the FTA-compliant Tax Invoice PDF (pdf-lib)
└── invoicing.js                          → subtotal/VAT/total calculation
schema.sql                                → full database schema
migrations/                               → incremental SQL for already-deployed databases
```
