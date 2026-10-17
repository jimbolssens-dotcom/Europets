# WhatsApp concierge review — playbook

A scheduled Claude session runs this twice a week (Monday and Thursday
mornings, UAE time) so the concierge keeps learning from its own mistakes
without Jim having to ask. Read this whole file, then `CLAUDE.md`, then
the previous reports in this folder, before doing anything.

## 1. Gather

- Supabase project `bqypjwnnusyrrqktcrlc` (see CLAUDE.md), table
  `client_messages`, WhatsApp only. Cover everything since the last
  report's "Covered up to" time (or the last 4 days if there is none).
- Pick the 10 to 15 conversations most worth reading. Put first:
  - threads with an automatic notice (`is_notice`) or an AI reply (`sender = 'ai'`);
  - threads flagged for staff (`client_message_thread_state.flagged`);
  - threads where the client wrote again and again with no real reply;
  - anything between 19:00 and 08:00 UAE time.
- Read each one in full, in UAE time, with the code that produced each
  automatic message in mind: `lib/whatsappConcierge.js`,
  `lib/whatsappUnanswered.js`, `lib/whatsappSweepDecision.js`,
  `lib/clientAcknowledgement.js`, `lib/clinicHours.js`,
  `app/api/whatsapp/webhook/route.js`.

## 2. Judge

What Jim cares about, in order:

1. **No client left in silence**, and none misled. A real question gets a
   real answer or an honest "we'll get back to you".
2. **Honest about timing, without shutting people down.** Never "shortly"
   when nobody is there. From 19:00 to 08:00 the clinic is closed: bookings
   and simple questions still get answered, thank-yous get nothing, and only
   what's waiting on staff gets a short, warm night message written for
   what the client said, saying the team will reply when we open at 8:00.
   The 24-hour-vet line only when the pet may be unwell, hurt or in danger
   (never for a pet staying with us), naming no clinic.
3. **No noise.** One notice per wait. Nothing for "ok", "thanks", 👍,
   stickers. Nothing while staff are actively in the thread.
4. **Caring, short, warm, in the client's language.** No long dashes.
5. **Books what it can.** Routine bookings shouldn't be escalated; medical
   questions, money and anything uncertain always should be.
6. **Never wrong on facts**: availability, dates, appointment details.

For each problem found, note the thread (date, time, first 8 characters of
the thread key, never the client's name or number), what was sent, what
should have happened, and why the code did what it did.

Ignore one-offs that are not the concierge's doing (a staff typo, Meta
delivery hiccups). Look for patterns, and for a mistake that a previous
report already "fixed" coming back: that means the fix didn't work.

## 3. Fix

Work on a fresh branch from `claude/find-europet-program-jbop5w` (the
production branch).

**Goes live on its own** (merge to `claude/find-europet-program-jbop5w`
once tests pass):

- When or whether a notice is sent: repeats, timing, cooldowns, missed
  acknowledgements, reactions, stickers, staff-active detection.
- Bugs where the code plainly contradicts a rule above or a rule already
  written in the code's comments.
- Tightening the AI's instructions so it follows rules it already has
  (e.g. it escalated a routine vaccine booking, or said "shortly" at night).
- New test cases.

**Waits for Jim's OK** (leave on the branch, push it, describe it in the
report with before/after):

- Any new or changed wording a client will read in an automatic notice.
- Anything that changes what the AI may do, book, cancel or answer, or
  what it escalates.
- Any database migration.
- Anything you're not sure about.

Every fix:

- Add a test in `tests/` that replays the real thread (anonymised, as in
  `tests/clinic-hours-notices.test.mjs`) and fails without the fix.
- Run `node --test tests/*.test.mjs` and `npx next build`. Both must pass
  before any merge. If they don't, don't merge.
- Keep the change minimal and match the surrounding code and comments.
- Merge by fast-forward only: `git push origin HEAD:claude/find-europet-program-jbop5w`
  after checking the production branch is an ancestor. Then check the
  Vercel production deployment (project `prj_Jp0xnSW5nCmS0iY7iAgUBILFyIYo`,
  no teamId) reaches READY. If it errors, revert the commit the same way
  and say so.
- Commit messages say what changed for clients, in plain words.

## 4. Report

Write `docs/concierge-review/YYYY-MM-DD.md` and commit it with the fixes:

- **Covered up to:** the newest message time looked at (UAE).
- **Conversations read:** how many, how many had a problem.
- **What went well** (one or two lines).
- **Problems found:** each with thread ref, what happened, what should have.
- **Fixed and live:** what, and the commit.
- **Waiting for your OK:** what, the branch, before/after wording.
- **Watch list:** things seen once that might be a pattern; check them next time.

End the session with a short summary for Jim in plain language: what
was wrong, what's now fixed and live, what needs his "merge it". If
nothing was wrong, say so in one line.
