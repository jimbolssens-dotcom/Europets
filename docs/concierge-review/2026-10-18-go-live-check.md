# Go-live check — concierge rewrite (17–18 October 2026)

**Covered up to:** 18 Oct 00:18 UAE. Two real conversations since the rewrite went live (17 Oct ~21:44).

## Problems found

1. **Apologised for a draft the client never saw** (8dfa74e8, 17 Oct 21:50). Rescheduling Charlie's consult went well, but after the second look sent a draft back, the redo opened "Sorry, let me lay those out properly". It also listed all 24 open times.
2. **Wrongly said a registered pet wasn't registered** (0300d1a9, 18 Oct 00:16). "I would like to take an appointment, for Monday": the pet is on file, but an earlier "Intake link sent" note in the thread made the AI say it wasn't, point to a link "sent above", and hand over instead of offering Monday's times. Handed over, it then couldn't correct itself when the client replied "I have registered".

## Fixed and live

- The redo instruction now says the client hasn't seen the draft and not to refer to or apologise for it.
- The AI is told: being closed never stops it booking or offering times; a listed pet means the client is registered, whatever an earlier automated note says; never mention a link or message that wasn't sent; offer four to six times, not every slot.
- These are instruction changes, so there is no unit test; the next review checks they held.

## For the team

- 0300d1a9 is waiting for a Monday appointment for Lisa (flagged).

## Watch list

- After the AI hands over by mistake it can't correct itself until staff reply. If this recurs, consider letting the AI take back a thread it handed over itself when the client's next message is something it can do.
- The 20:46 reschedule (old code) was answered by the sweep an hour later, once the new code went live: fine, but late.
