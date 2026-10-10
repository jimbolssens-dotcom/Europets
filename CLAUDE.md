# Europets — standing instructions

## Connected services — use these IDs

- **Supabase (live database): project ref `bqypjwnnusyrrqktcrlc`**
  (`https://bqypjwnnusyrrqktcrlc.supabase.co`, the value of
  `NEXT_PUBLIC_SUPABASE_APP_URL`). The Supabase connector's
  `list_projects` does NOT show it, but `execute_sql` / `apply_migration`
  with this ref work. Ignore `supabase-cyclamen-nest`
  (`ukvjfhnnjimfhuauzsuc`): it's the empty project Vercel's Supabase
  integration created, behind the unused `SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_URL` vars. The app reads only the `*_APP_*` vars
  (see `lib/supabaseClient.js`, `lib/supabaseAdmin.js`).
- **Vercel: project `europets` (`prj_Jp0xnSW5nCmS0iY7iAgUBILFyIYo`)** on
  the personal Hobby account `jimbolssens-dotcom`. Call the Vercel tools
  WITHOUT `teamId` — passing `team_5sYq4rnyb3ApDF8MlYUJyHJv` returns 403.
  The marketing site is the separate `website` project.

## Every new migration: paste the SQL, then run it yourself

There's no automatic migration runner, but Claude is authorised to apply
migrations to the live database. Whenever a change needs a new migration:

1. Create the file in `migrations/NNN_*.sql` as normal.
2. **Paste the full SQL as a copy-pasteable block in the chat reply**, so
   the user can see exactly what's being run.
3. Run it on project `bqypjwnnusyrrqktcrlc` with the Supabase
   `apply_migration` tool (name it after the file, e.g.
   `166_client_messages_email_channel`).
4. Verify it took (query the catalog for the new columns / constraints /
   policies) and say plainly in the reply that it has been run and
   verified — or, if it failed, show the error and say what won't work
   until it's fixed.

Write migrations to be safe to re-run (`if not exists`, `drop ... if
exists`). Ask before running anything destructive (dropping tables or
columns, deleting or rewriting data).

## Side by side, not stacked (especially on mobile)

Wherever there's room, put things next to each other instead of stacking
them one per line, so more of the actual list shows on screen. That means
page titles with their links or buttons, small buttons, and short fields.
Let a row wrap only when it genuinely doesn't fit.

- A page title and its actions go in `.page-header` (title left), with
  the actions grouped in `.page-header-actions` (right). Both compact
  automatically on phones (see globals.css).
- Never give a short link or button its own `<p>` or line under a title.
- Keep mobile minimal. Show Jim a phone-width screenshot (390px) before
  merging any layout change.
