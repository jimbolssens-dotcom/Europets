// lib/conciergeReplayCases.js
// Real moments from the concierge reviews (docs/concierge-review/), replayed
// on app/(admin)/concierge-review to compare what was actually sent with what
// the concierge would do now. Each is a client and the moment just after
// their message, or just the message's id (for a number that isn't a client
// yet); the page and its API look the rest up.

export const CONCIERGE_REPLAY_CASES = [
  { label: 'Unknown number: three dogs, would like to arrange a visit', message_id: 'f6ea2693-a32b-4f66-a8bb-2551663a00e4' },
  { label: 'Unknown number, 07:53 before opening: parrot not feeling well, is the doctor available?', message_id: '90973cc4-67a8-4d12-9c96-9000fa8ab17a' },
  { label: 'Unknown number, 23:50: charity rates for tests on stray cats', message_id: 'f5bf90af-ffc3-4e12-ad96-13850011177c' },
  { label: 'Unknown number, mid-conversation with staff: "Yes 10am is perfect tomorrow"', message_id: '0728e0c1-7526-42a9-a3db-96900895482b' },
  { label: 'Night, unregistered number: a kitten urgently needs treatment', message_id: '514a53f4-23c7-43d2-8df6-27488a08febb' },
  { label: 'Night: picking a time for a booking ("Can I do 9:30am please")', message_id: '737ce864-da26-4720-b6b6-9cae215c939f' },
  { label: 'Night: a plain thank-you', message_id: '00213c70-4992-4b73-b6af-209ff4056232' },
  { label: 'A 👍 reaction while waiting on staff', message_id: 'd6fb6dba-b31f-4eb2-bfe9-d4c402aac351' },
  { label: 'A 🩷 after the AI already said "you\'re welcome"', message_id: '8bd2c257-014f-4083-8aad-3c2accb5f145' },
  { label: 'Evening, 3 minutes after staff replied: "Yes, please do... Cheers"', message_id: 'ae219e4e-72b4-4479-8b94-d5c52f51abfa' },
  { label: '"what surgery?" right after a surgery reminder', client_id: 'd9d6ddb0-d42f-4437-853a-382b2506695c', as_of: '2026-10-15T15:30:39Z' },
  { label: 'Thinks they have an appointment on the 23rd, wants the 22nd', client_id: '30eef6a6-e682-4037-9bfe-84a91589f1e5', as_of: '2026-10-15T11:07:13Z' },
  { label: 'Owner of a pet in our hospital, at night: "tomorrow will pick him up"', client_id: 'd9d6ddb0-d42f-4437-853a-382b2506695c', as_of: '2026-10-17T16:11:40Z' },
  { label: 'Move Monday to Tuesday, sent as two quick messages', client_id: 'c923f20a-d470-415d-9c4b-b3b0ae795097', as_of: '2026-10-17T12:25:15Z' },
  { label: 'Which doctor is it? (after a reminder)', client_id: '1159ef1f-90ac-4eae-893b-a4817860fff2', as_of: '2026-10-16T13:32:57Z' },
  { label: '"You received Blacky?"', client_id: '9f6c8de1-8d56-42f8-8484-cdb5335a300f', as_of: '2026-10-16T12:47:55Z' },
  { label: 'Picking a time at night: "Yes 10 is good"', client_id: '7eabe1e3-5416-4409-92ea-9685dac40d63', as_of: '2026-10-13T19:24:43Z' },
  { label: 'Asking about blood results, in the evening', client_id: '5dd6946b-794e-40ab-a752-74042e5cf619', as_of: '2026-10-16T15:28:29Z' },
  { label: 'Confirming a food pickup today', client_id: '0bc53b7b-2dad-4992-993f-b07bc241595a', as_of: '2026-10-17T06:58:49Z' },
];
