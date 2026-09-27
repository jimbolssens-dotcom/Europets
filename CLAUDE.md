# Europets — standing instructions

## Every new migration: paste the SQL, don't just name the file

This app has no automatic migration runner — every `migrations/NNN_*.sql`
file has to be run by hand in the Supabase SQL editor. Whenever a change
needs a new migration:

1. Create the file in `migrations/` as normal.
2. **Paste the full SQL as a copy-pasteable block directly in the chat
   reply**, not just "run migrations/149_whatever.sql." The user works
   from the pasted SQL, not by opening the repo file.
3. Say plainly that it needs to be run before the feature will work, and
   name what breaks if it isn't run yet (so it's obvious when something's
   just "not migrated" rather than actually broken).

This applies every time, not just the first time — don't let a description
of the migration substitute for pasting it.
