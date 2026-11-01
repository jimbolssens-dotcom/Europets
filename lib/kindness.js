// lib/kindness.js
// The homepage's daily kindness mission and greeting (app/_components/
// KindnessHome.jsx). Jim: something cute that reminds the team to be kind,
// to bring happiness, and to make someone smile a priority every day.

export const KINDNESS_MISSIONS = [
  { emoji: '🐾', text: "Learn one pet's nickname today and use it when you say goodbye." },
  { emoji: '💌', text: 'Write a two-line thank-you to a colleague. Paper or WhatsApp, both count.' },
  { emoji: '☕', text: "Make someone's coffee or tea without being asked." },
  { emoji: '😊', text: 'Greet every owner by name and smile before you say anything else.' },
  { emoji: '🧸', text: 'Give a nervous pet one extra minute of calm before the exam.' },
  { emoji: '🌟', text: 'Tell a colleague one specific thing they did brilliantly this week.' },
  { emoji: '📸', text: 'Snap a happy patient photo (with permission) to brighten the owner\'s day.' },
  { emoji: '🎈', text: 'Ask an owner how they are doing, not just their pet. Then really listen.' },
  { emoji: '🍪', text: 'Share a snack with whoever has had the busiest shift.' },
  { emoji: '🤝', text: 'Offer to help someone finish a task before you take your break.' },
  { emoji: '💐', text: 'Leave the consult room nicer than you found it, for the next person.' },
  { emoji: '🐶', text: 'Celebrate a patient going home today. A little cheer goes a long way.' },
  { emoji: '🌈', text: 'Turn one complaint today into a "thank you for telling us".' },
  { emoji: '🎶', text: 'Hum, whistle or play a happy song in the prep room.' },
  { emoji: '🐱', text: 'Send one owner a quick "your cat was an angel today" message.' },
  { emoji: '🙌', text: 'Say thank you to the cleaners, drivers and everyone behind the scenes.' },
  { emoji: '🫶', text: 'Notice someone who looks tired and ask if you can take one thing off them.' },
  { emoji: '🧡', text: 'Remember: every pet is someone\'s whole world. Treat them that way.' },
  { emoji: '😂', text: 'Share something that made you laugh with the team.' },
  { emoji: '📝', text: 'Write a kind note in a patient\'s file for the next shift ("loves chin scratches").' },
  { emoji: '🌻', text: 'Start the day by wishing every colleague a good morning, properly.' },
  { emoji: '🎁', text: 'Surprise a long-stay patient with a new toy or a cosy blanket.' },
  { emoji: '👂', text: 'Let someone finish their sentence. Then ask one more question.' },
  { emoji: '🐰', text: 'Explain one thing to an owner more simply than you did yesterday.' },
  { emoji: '💪', text: 'Encourage the newest person on the team. Everyone started somewhere.' },
  { emoji: '🌙', text: 'Before you leave, tell the next shift one good thing that happened today.' },
  { emoji: '🥳', text: 'Find a reason to celebrate today, however small.' },
  { emoji: '🍀', text: 'Hold the door, carry the bag, walk the owner to their car.' },
  { emoji: '✨', text: 'Pay a sincere compliment to three different people today.' },
  { emoji: '🐕', text: 'Give every dog you meet today a moment of your full attention.' },
  { emoji: '💛', text: 'Be the reason someone smiles today. That\'s the whole mission.' },
];

export const KINDNESS_QUOTES = [
  'No act of kindness, no matter how small, is ever wasted.',
  'Be the person your patients think you are.',
  'A smile is the shortest distance between two people.',
  'Kindness is a language everyone understands, even the cats.',
  'Small things, done with love, change days.',
  'Happiness grows when it is shared.',
  "You can't pour from an empty cup. Be kind to yourself too.",
];

// Day of the year in the clinic's time zone (UAE, UTC+4): everyone sees
// the same mission all day.
export function clinicDayNumber(now = new Date()) {
  const uae = new Date(now.getTime() + 4 * 3600e3);
  const start = Date.UTC(uae.getUTCFullYear(), 0, 0);
  return Math.floor((uae.getTime() - start) / 86400e3);
}

export function missionFor(now = new Date()) {
  return KINDNESS_MISSIONS[clinicDayNumber(now) % KINDNESS_MISSIONS.length];
}

export function greetingFor(now = new Date()) {
  const hour = new Date(now.getTime() + 4 * 3600e3).getUTCHours();
  if (hour < 5) return { text: 'Hello, night owl', emoji: '🦉', sky: 'night' };
  if (hour < 12) return { text: 'Good morning', emoji: '☀️', sky: 'morning' };
  if (hour < 17) return { text: 'Good afternoon', emoji: '🌤️', sky: 'afternoon' };
  if (hour < 21) return { text: 'Good evening', emoji: '🌇', sky: 'evening' };
  return { text: 'Good night', emoji: '🌙', sky: 'night' };
}

// Start of this week (Monday 00:00 UAE) as an ISO time, for counting the
// garden's smiles.
export function weekStartISO(now = new Date()) {
  const uae = new Date(now.getTime() + 4 * 3600e3);
  const day = (uae.getUTCDay() + 6) % 7;
  const monday = Date.UTC(uae.getUTCFullYear(), uae.getUTCMonth(), uae.getUTCDate() - day);
  return new Date(monday - 4 * 3600e3).toISOString();
}

export const FLOWERS = ['🌼', '🌸', '🌻', '🌷', '🌺', '💐', '🌹', '🪻'];
