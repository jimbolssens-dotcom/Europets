# Europets — Vet Clinic Management System

Next.js + Supabase app for managing a multi-room vet clinic: clients, patients,
appointments, visits, and invoicing.

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
   `schema.sql` in its SQL editor to create the tables.
3. Copy `.env.local.example` to `.env.local` and fill in your Supabase project
   URL and anon key.
4. Run the dev server:
   ```
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000).

## Build phases
1. **Clients & Patients database** ← current
2. Appointments (15-min consult / 10-min surgery increments)
3. Visits & real-time consult notes (multi-user across rooms)
4. Goods/services & invoicing (flat + per-kg pricing, 5% UAE VAT)
5. AI layer — consult/surgery audio → summarized notes
6. FileMaker migration

## Folder layout
```
app/
├── api/
│   ├── clients/route.js    → client CRUD endpoints
│   └── patients/route.js   → patient CRUD endpoints
├── clients/page.jsx        → client list & create form
├── patients/page.jsx       → patient list & create form (realtime)
└── layout.js, page.js      → app shell & home page
lib/
└── supabaseClient.js       → shared Supabase connection
schema.sql                  → full database schema
```
