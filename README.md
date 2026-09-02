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
> full card scan rather than a cropped headshot. A photo picked from an
> iPhone/iPad's photo library is often HEIC — Claude's vision API doesn't
> accept that format, so `/api/clients/scan-id` converts it to JPEG
> server-side (via `heic-convert`) before reading it, and that converted
> JPEG is what gets saved as the attachment too, so it displays correctly
> in browsers that can't render HEIC.

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
   from the catalog, and surgical/dental reports. Also embeds the same
   Vaccination History + Add Vaccination module as the patient page (under
   Notes, in the same column), so a vaccination given during the visit can
   be recorded without leaving the consult
4. ✅ Goods/services & invoicing (flat + per-kg pricing, 5% UAE VAT) — a
   consult can open an invoice that imports its whole treatment plan as
   line items in one click, then take more items added afterward.
   UAE FTA-compliant Tax Invoice PDFs: sequential invoice numbering, the
   clinic's own TRN (Settings page), and the client's TRN if they're a
   VAT-registered business. The catalog (`/catalog`) is split into three
   fixed main categories — Products, Tests, Services — each with its own
   tab and an editable list of subcategories (e.g. Tests: X-Ray,
   Ultrasound, PCR, Blood Test - CBC, Blood Test - GHP, Urine, ...) that
   staff can keep extending as the clinic starts offering new ones,
   without a code change. Every item belongs to exactly one subcategory,
   which fixes its main category automatically. Catalog dropdowns
   elsewhere (a consult's treatment plan, a worksheet entry's items) group
   the item list the same way, via `<optgroup>`s ordered Product / Test /
   Service
5. ✅ Hospitalization — standalone multi-day admissions with a day-to-day
   worksheet grouped by day (every entry for a day sits together under
   one heading with its own timestamp, so nothing looks lost as new
   entries land above older ones). Entries are append-only — a check-in
   later in the day is a new, separately timestamped and authored entry
   rather than an edit to a previous one, so the worksheet is a full log
   of every touch, not just the latest state — startable from a consult,
   with photo capture (camera button on iPad/phones) and a one-click PDF
   summary — including the case's and each day's photos, grouped by day
   with each entry's time and author — to share with the client. A "Share
   Client Portal Link" button sends a live, read-only, client-facing page
   over WhatsApp (no PDF/attach step) that shows each entry's time and
   author too, and updates automatically until discharge. A Cage Layout
   page (`/hospitalization/cages`) shows the clinic's fixed physical cage
   map — 12 standard cages, 5 long-term bungalows, 4 recovery, 4 dog, 3
   isolation, 5 post-op (one doubling as the oxygen room) — grouped and
   color-coded by occupancy; tap/click an occupied cage to jump straight to
   that case's file, or assign a currently-admitted, unassigned patient to
   an empty one from a dropdown right on the tile. Occupied cages are also
   draggable — mouse-drag on desktop or touch-drag on iPad (built on
   Pointer Events, not the HTML5 DnD API, since iOS Safari doesn't support
   that) — drop onto an empty cage to move the patient there, or onto an
   occupied one to swap the two. A cage can only hold one admitted case at
   a time (DB-enforced). Every worksheet entry can also log medications,
   goods/services, and tests given at that check-in (catalog item +
   instructions + quantity, staged on the Add Worksheet Entry form and
   saved together with the entry in one submission) and record the
   patient's weight — "Create Invoice from Worksheet" at discharge
   consolidates everything logged across every entry into one invoice, the
   same way a consult's treatment plan does
6. ✅ AI layer — record a consult or surgery in the browser, AssemblyAI
   transcribes it, Claude summarizes it, and the summary is folded into
   consult notes / the surgical report automatically. A small 🎤 button on
   individual fields (anamnesis, findings, treatment notes, surgical/dental
   notes) does the same for a short dictation, filling in just that field
7. ✅ Vaccinations — a species-tagged protocol catalog (Settings → Vaccine
   Protocols: PCH (Feline Flu + Enteritis, given as one combined vaccine)
   and Rabies for cats; DHPPi + Lepto, Rabies, and optional Kennel Cough
   for dogs) recorded per patient, with the Add Vaccination form on a
   patient's page automatically filtered to protocols for their species.
   Each record gets a next-due date (defaults to the protocol's interval,
   usually annual, from the date given — stays editable). The Vaccinations
   nav page is a clinic-wide due/overdue list; its WhatsApp/Email buttons
   draft a pre-filled reminder for staff to send themselves and mark it
   reminded — there's no connected email service or WhatsApp Business API
   to send these automatically yet (same limitation as the hospitalization
   portal's WhatsApp sharing). Add Vaccination has two submit actions
   instead of one — Add as Annual Vaccine (the normal ~12-month cycle) or
   Add as Primary Booster, for a puppy/kitten's first visit: it reschedules
   the species' core vaccine (PCH / DHPPi + Lepto) for a 1-month booster
   instead of the normal annual interval, and automatically checks whether
   rabies was checked in that same submission — if not, it adds a rabies
   reminder for that same 1-month date (a "scheduled, not yet given"
   record); if rabies WAS given, it just stays on its normal annual cycle.
   Reminders due on the same date for the same patient (e.g. a Primary
   Booster's core vaccine + its rabies reminder) are grouped into one row
   and one WhatsApp/Email draft instead of sending one per vaccine
8. ✅ New-Client Intake — staff generate a public, no-login link
   (`/intake`) to send a first-time caller over WhatsApp before their
   visit; the client fills in their own details and one or more pets from
   `/portal/intake/[id]`. Submissions land in a review queue, not
   straight into `clients`/`patients` — Approve creates the real client
   and patient record(s); Reject just discards it. Same "unguessable
   link, not login" security model as the hospitalization portal
9. FileMaker migration

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
│   ├── diagnostics/, treatment-items/    → per-consult diagnostics & treatment plan —
│   │                                        treatment-items also serves a hospitalization
│   │                                        worksheet entry's medications/goods/tests
│   │                                        (hospitalization_note_id instead of visit_id;
│   │                                        exactly one is required)
│   ├── surgical-reports/, dental-reports/ → per-consult advanced-treatment reports
│   ├── hospitalizations/                 → admissions + day-to-day worksheet notes
│   │                                        (append-only — no edit endpoint; each entry can
│   │                                        include a weight and its own treatment_items,
│   │                                        submitted together in one POST)
│   ├── hospitalizations/[id]/summary-pdf → PDF summary for sharing with the client
│   ├── hospitalizations/[id]/invoice     → create (or reuse) an invoice for an admission,
│   │                                        importing its logged items as line items — the
│   │                                        hospitalization equivalent of visits/[id]/invoice
│   ├── cages/route.js                    → the clinic's fixed cage layout (read-only list)
│   ├── attachments/                      → file metadata (files live in Storage)
│   ├── recordings/route.js               → save an uploaded recording + submit for transcription
│   ├── recordings/[id]/webhook/route.js  → AssemblyAI callback → Claude summary → notes/report
│   ├── voice-to-text/route.js            → dictate one field: transcribe + summarize synchronously
│   ├── search/route.js                   → find clients/patients by name/phone/breed/microchip
│   ├── clients/scan-id/route.js          → read name + ID number off a photo of an Emirates ID
│   ├── goods-services/route.js           → catalog CRUD (main_category is derived from
│   │                                        whichever subcategory_id you give it)
│   ├── catalog-subcategories/route.js    → the editable Product/Test/Service subcategory
│   │                                        lists (Settings-style CRUD, used by the Catalog page)
│   ├── invoices/route.js                 → list/open invoices
│   ├── invoices/[id]/line-items/         → add/remove invoice line items
│   ├── visits/[id]/invoice/route.js      → create (or reuse) an invoice for a consult,
│   │                                        importing its treatment plan as line items
│   ├── invoices/[id]/tax-invoice-pdf/    → FTA-compliant Tax Invoice PDF for one invoice
│   ├── clinic-settings/route.js          → the clinic's own TRN/identity (singleton row)
│   ├── vaccine-protocols/route.js        → the species-tagged vaccine catalog (Settings UI)
│   ├── vaccinations/route.js             → per-patient records (annual or primary-booster,
│   │                                        picked when the vaccination is added); ?due=true
│   │                                        for the reminders list
│   └── intake-requests/route.js          → generate a blank intake link (staff); [id] route
│                                            handles the client's public submit and staff's
│                                            approve/reject review
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
│   ├── hospitalization/cages/              → visual cage-layout map — click an occupied cage to
│   │                                          open its case, assign an empty one from a dropdown
│   ├── invoices/                           → list + create; invoices/[id] is a single invoice's page
│   ├── catalog/                            → catalog UI — Product/Test/Service tabs, each with
│   │                                          its own item list, Add Item form, and an editable
│   │                                          subcategory list (add/rename/deactivate/delete)
│   ├── vaccinations/                       → clinic-wide due/overdue list, with WhatsApp/Email
│   │                                          reminder drafting per record (same-day reminders
│   │                                          for one patient are grouped into one message)
│   ├── intake/                             → generate intake links, review submissions
│   │                                          (Approve/Reject), see recently approved
│   ├── rooms/, staff/, vaccine-protocols/  → admin lists, edit/delete — tucked under Settings
│   └── settings/                           → clinic legal name/TRN/address for tax invoices
├── portal/                                 → client-facing pages — NO staff nav (see security
│   │                                          note above), noindex. Add new client-facing pages here.
│   ├── layout.js
│   ├── hospitalization/[id]/               → live read-only view of one admission
│   └── intake/[id]/                        → new-client self-service form (name/contact + pets)
├── _components/AttachmentSection.jsx     → reusable file upload/list widget (staff, w/ upload+delete)
├── _components/AttachmentGallery.jsx     → read-only file/photo gallery (client portal)
├── _components/SearchBox.jsx             → nav search box with a live results dropdown
├── _components/ScanIdButton.jsx          → camera button that reads an Emirates ID card
├── _components/AudioRecorder.jsx         → record/upload audio, show transcript+summary
├── _components/VoiceToTextButton.jsx     → small 🎤 button that dictates a single field
├── _components/SpeciesField.jsx          → Cat/Dog dropdown with an "Other..." free-text fallback
├── _components/useVaccinations.js        → shared state/logic behind recording a vaccination —
│                                            used by both patients/[id] and consults/[id]
├── _components/VaccinationForm.jsx       → the Add Vaccination card (species-filtered checklist,
│                                            Annual/Primary Booster) — takes useVaccinations' state as props
└── _components/VaccinationHistory.jsx    → read-only vaccination table with Delete. Each page lays
                                             the two out differently: the patient page puts the form
                                             beside its info panel with history below; the consult
                                             page stacks history then form under Notes
└── layout.js                             → bare root shell (html/body only — see security note)
lib/
├── supabaseClient.js                     → shared Supabase connection
├── attachments.js                        → client-side Storage upload helper
├── recordings.js                         → client-side recording upload helper
├── assemblyai.js                         → server-side AssemblyAI REST calls
├── anthropicClient.js                    → server-side Claude summarization
├── hospitalizationSummaryPdf.js          → builds the hospitalization summary PDF (pdf-lib)
├── formatTimestamp.js                    → shared entry-timestamp formatting (staff page + portal)
├── taxInvoicePdf.js                      → builds the FTA-compliant Tax Invoice PDF (pdf-lib)
├── species.js                            → loose cat/dog classification for vaccine filtering
├── invoicing.js                          → subtotal/VAT/total calculation
└── catalogGrouping.js                    → groups goods_services items by subcategory for
                                             <optgroup>-based catalog dropdowns (Product/Test/
                                             Service order), shared across every "add item from
                                             catalog" form
schema.sql                                → full database schema
migrations/                               → incremental SQL for already-deployed databases
```
