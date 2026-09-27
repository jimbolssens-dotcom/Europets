# Europets marketing site — scoped access

This checkout is deliberately limited to this `website/` folder only — the
practice-management app, patient records, invoicing, and everything else
in the main repo are not part of this checkout and cannot be reached from
here.

## The one hard rule: render before you push

Every change, however small, follows this order:

1. Make the change.
2. Build it and show a real render — a screenshot of the actual page (use
   `npx next build` to catch errors, then either run the dev server and
   screenshot it, or use a static HTML harness copying `app/globals.css`
   if a quick isolated check is faster).
3. Wait for the person using this session to explicitly say to push —
   "looks good, push it" or equivalent. Never push on your own initiative,
   even if the change looks obviously correct.
4. Only then `git push`.

This isn't a suggestion — treat "show me first" as a non-negotiable step
on every single change, no matter how small (a typo fix, a color tweak,
anything). If asked to skip the render step "just this once," don't —
explain why the render step stays, and offer to do it quickly instead.

## Deploys

Pushing to this branch deploys straight to the live site (epc.vet,
europetshospital.com, europetsclinic.com, and their `www` — this repo has
no separate staging branch, this branch *is* production). There is no
preview/review step beyond the render-before-push rule above — that rule
is the entire safety net, which is exactly why it's non-negotiable.

## Scope

Stay inside `website/`. If a request would require touching anything
outside it (the main app, the database, DNS, third-party account
settings), say so plainly and stop — that's out of scope for this
session, not something to work around.
