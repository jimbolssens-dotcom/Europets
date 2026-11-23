// lib/conciergeDebounce.js
// How long the concierge waits after a client's message before answering,
// so a quick follow-up is read together with it (app/api/whatsapp/webhook).
// A bare greeting ("Good evening", "Hi") is nearly always followed by the
// real question within seconds, so it waits longer: answering the greeting
// on its own crossed with the question (concierge review 23 Nov: "Good
// Evening", then 10 seconds later "Can I schedule a check up for three of my
// cats", and the reply to the greeting asked "How can I help you today?").

export const DEBOUNCE_MS = 2000;
export const GREETING_DEBOUNCE_MS = 15000;

const GREETING =
  /^(hi+|hello+|hey+|hiya|good\s+(morning|afternoon|evening|day)|morning|evening|salam|salaam|as+alam+u?\s*alaikum|assalamu\s*alaikum|marhaba|ahlan|bonjour|hallo|hola|namaste|dear|hi\s+there|hello\s+there)([\s,!.]*(dr\.?\s*\w+|doctor|doc|team|everyone|sir|madam|ma'?am|there))?[\s,!.😊🙏👋🌸❤️]*$/iu;

export function isBareGreeting(text) {
  const t = String(text || '').trim();
  return t.length > 0 && t.length <= 40 && GREETING.test(t);
}

export function debounceFor(text) {
  return isBareGreeting(text) ? GREETING_DEBOUNCE_MS : DEBOUNCE_MS;
}
