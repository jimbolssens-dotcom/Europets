# Europets — Vet Clinic Management System

Next.js + Supabase app for managing a multi-room vet clinic: clients, patients,
appointments, visits with live consult notes, and invoicing.

## Stack
- **Frontend + Backend**: Next.js (App Router) — API routes double as the backend.
- **Database**: Supabase (hosted Postgres) with realtime subscriptions, auth, and
  an auto-generated client.
- **Hosting**: Vercel (app) + Supabase (database).

## Getting started
1. Install dependencies:
   ```
   npm install
   ```
2. Create a free project at [supabase.com](https://supabase.com), then run
   `schema.sql` in its SQL editor. This creates the tables, adds the
   realtime-changes publication the app relies on, and leaves RLS disabled
   (see note below).
3. Copy `.env.local.example` to `.env.local` and fill in your Supabase project
   URL and publishable key (Project Settings → API Keys).
4. Run the dev server:
   ```
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000).

> **Security note:** RLS is intentionally left disabled — there's no staff
> auth yet, and the app talks to Supabase directly with the publishable key.
> Add auth and RLS policies before this holds real client data.

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
3. ✅ Visits & real-time consult notes (multi-user across rooms)
4. ✅ Goods/services & invoicing (flat + per-kg pricing, 5% UAE VAT)
5. AI layer — consult/surgery audio → summarized notes
6. FileMaker migration

## Folder layout
```
app/
├── api/
│   ├── clients/route.js               → client CRUD
│   ├── patients/route.js              → patient CRUD
│   ├── rooms/route.js                 → room CRUD
│   ├── staff/route.js                 → staff CRUD
│   ├── appointments/route.js          → booking (list/create)
│   ├── appointments/[id]/route.js     → status updates (check-in, cancel, ...)
│   ├── visits/route.js                → start a visit (from appointment or walk-in)
│   ├── visits/[id]/route.js           → complete a visit
│   ├── consult-notes/route.js         → per-visit note thread
│   ├── goods-services/route.js        → catalog CRUD
│   ├── goods-services/[id]/route.js   → edit/toggle a catalog item
│   ├── invoices/route.js              → list/open invoices
│   ├── invoices/[id]/route.js         → invoice detail, status updates
│   └── invoices/[id]/line-items/      → add/remove invoice line items
├── clients/, patients/                → list & create-form UI
├── appointments/                      → day-view booking calendar
├── visits/                            → active-visits board with live notes
├── invoices/, catalog/                → invoicing UI
├── rooms/, staff/                     → admin list & create-form UI
└── layout.js, page.js                 → app shell & home page
lib/
├── supabaseClient.js                  → shared Supabase connection
└── invoicing.js                       → subtotal/VAT/total calculation
schema.sql                             → full database schema
```
