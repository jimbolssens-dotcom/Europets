-- Migration 063: two policy additions the clinic asked to make "abundantly
-- clear" —
--
-- 1. A dedicated "Our Culture" category, pinned first (sort_order 0, ahead
--    of every other category), whose one policy states plainly that
--    kindness/warmth/compassion is the clinic's #1 standard — not a nice-
--    to-have alongside the procedural policies, but the thing every other
--    policy in this manual sits on top of.
-- 2. A new "Emergencies & Walk-Ins" policy: nobody claiming an emergency,
--    and no walk-in, is ever turned away — a non-appointment surcharge is
--    explained instead of a refusal. Existing policies that touch
--    scheduling/greeting are updated to point at or echo this.

insert into policy_categories (name, sort_order) values
    ('Our Culture: Kindness First', 0);

insert into policies (category_id, title, sort_order, content)
select id, 'Kindness, Warmth & Compassion — Our #1 Standard', 1, $policy$This comes before every other policy in this manual on purpose — it matters more than any procedure in it. A client's lasting impression of this clinic is not the treatment plan; it's whether they felt welcomed, heard, and genuinely cared for by a team that was glad to see them and their pet.

Standard:
- Smile. Every client, every patient, every time — even on your hardest, busiest day. It's the first thing anyone notices, and it sets the tone for everything that follows.
- Be present. Put down what you're doing, make eye contact, and give the person in front of you your full attention, even for thirty seconds.
- Assume the best. A frustrated or anxious client is almost always scared for their pet, not being difficult. Meet that with patience, not defensiveness.
- Show it, don't just feel it. Crouch down to greet the dog. Speak gently to a frightened cat. Narrate what you're doing to a worried owner. Compassion only counts if the client can see it.
- Never make someone feel like a burden — not for calling with "just a question," not for needing extra reassurance, not for walking in without an appointment.

This is not a soft skill layered on top of the job. For this clinic, it is the job. Every other policy in this manual describes how we do things; this one describes who we are while we do them.$policy$
from policy_categories where name = 'Our Culture: Kindness First';

insert into policies (category_id, title, sort_order, content)
select id, 'Emergencies & Walk-Ins — Nobody Is Ever Turned Away', 3, $policy$Purpose: When someone believes their pet is having an emergency, or arrives without an appointment, our first job is to make them feel heard and cared for — not to judge whether their emergency is "real enough" at the front desk. Nobody is ever sent away.

Standard:
1. If a client says it's an emergency, treat it as one until a vet says otherwise. Don't question or debate it at reception — get them seen.
2. If the schedule looks fully booked, an emergency is fit in anyway. Speak to the vet/duty doctor immediately rather than telling the client to come back later or go elsewhere.
3. A walk-in without an appointment is never refused, regardless of how full the schedule looks. They are worked in as soon as possible, even if that means a short wait.
4. Explain, kindly and clearly, that being seen without a booked appointment — emergency or walk-in — carries a [clinic to confirm amount] non-appointment/emergency surcharge on top of the usual consult fee. Frame it as "there's a small surcharge for fitting you in outside our normal schedule," never as a penalty.
5. If a client is waiting and anxious, check in with them — a short "we haven't forgotten you, the vet will be right with you" goes a long way.

Notes: This policy overrides normal scheduling — "we're fully booked" is never, on its own, a reason to turn someone away. If truly no vet is available at all (not just no open slot), see [clinic to define] for how to handle referring them elsewhere — but that should be a rare exception, not a default response.$policy$
from policy_categories where name = 'Client Reception & Intake';

update policies
set content = $policy$Purpose: Keep the schedule predictable for vets and reduce client wait times.

Steps:
1. Confirm the reason for the visit before booking — this determines whether it needs a consult slot or a longer surgery slot.
2. Check room/vet availability on the schedule before confirming a time with the client.
3. Always confirm the patient's name and species when booking, not just the client's name.
4. On arrival, check the client in against their booked appointment. If they're a walk-in, register/confirm the patient's details first, then check in as unscheduled.
5. Let the client know the estimated wait time if the schedule is running behind.

Notes: [Clinic to confirm] standard consult length and how far in advance appointments can be booked online via the client intake link. Emergencies and walk-ins are never turned away, even when the schedule looks full — see "Emergencies & Walk-Ins — Nobody Is Ever Turned Away" for exactly how to handle them.$policy$,
    updated_at = now()
where title = 'Appointment Scheduling & Check-In';

update policies
set content = $policy$Purpose: Ensure every new client and patient is registered consistently and nothing falls through the cracks.

Steps:
1. Greet the client and their pet warmly, with a genuine smile — first impressions start here. Ask if they are new to the clinic. Check for an existing record first (name, phone, Emirates ID) before creating a new one — use the duplicate-match warning in Add Client if it appears.
2. Collect the client's full name, phone number (mark their WhatsApp number), email, and address.
3. Ask if they were referred by another client or found the clinic online, and note it.
4. Register each pet: name, species, breed, sex, date of birth (or estimated age), and colour. Scan the client's Emirates ID if available to speed up data entry.
5. Ask about microchip status. If already chipped, record the microchip number.
6. Explain the clinic's WhatsApp reminder system and confirm the client is happy to receive reminders on the number provided.
7. If this is a same-day appointment, proceed to booking/check-in immediately after registration.

Notes: A client should never be created twice under a different number — always search first. If in doubt, ask a senior staff member before creating a new client record for someone who may already exist.$policy$,
    updated_at = now()
where title = 'New Client & Patient Registration';

update policies
set content = $policy$Purpose: Present a consistent, professional, trustworthy face to every client, every time.

Standards:
- Above everything else on this list: smile, be warm, and make every client and patient feel genuinely cared for. See "Our Culture: Kindness First" — it matters more than anything else here.
- Uniform/dress code: [clinic to define].
- Greet every client warmly within a few seconds of them entering, even if you're mid-task with someone else — acknowledge them.
- Speak about patients and clients respectfully at all times, including when they're not present.
- Personal phone use is kept to breaks, not the treatment or reception floor.
- Confidentiality: client and patient information is never discussed outside the clinic or with other clients.

Notes: These are starting expectations — adjust to match how the clinic actually wants to present itself.$policy$,
    updated_at = now()
where title = 'Professional Conduct & Presentation';
