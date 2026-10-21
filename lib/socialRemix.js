// lib/socialRemix.js
// The remix buttons on the Social draft (app/_components/SocialTouchUp.jsx):
// what each asks the AI for (lib/socialDraftPrompt.js, buildRemixText).
// Its own small file so the page doesn't carry the whole prompt.

export const REMIX_TONES = [
  { key: 'funny', label: '😂 Funnier', ask: 'Make it funnier: gentle, warm humour that comes from what is actually in the photo, the kind anyone gets at once. Still plain words: no puns, no slang, no jokes about illness.' },
  { key: 'warm', label: '❤️ Warmer', ask: 'Make it warmer and more personal, like the team is proud of this pet. Not soppy.' },
  { key: 'short', label: '✂️ Shorter', ask: 'Make it shorter and punchier: the same story in fewer words.' },
  { key: 'question', label: '❓ Question', ask: 'Keep the story and end with one simple, friendly question that followers can answer in a comment about their own pet.' },
];
export const REMIX_TONE_KEYS = REMIX_TONES.map((t) => t.key);

