// lib/historyLink.js
// The private link to a patient's full history PDF that staff send owners
// (app/api/patients/[id]/history-pdf). A full history says far more than
// one consult report, so unlike those links it isn't just the record's id:
// it carries an expiry and a signature, and stops working after 30 days.
// Pure apart from reading the secret, so it can be tested.

import crypto from 'node:crypto';

export const HISTORY_LINK_DAYS = 30;

function secret() {
  return process.env.HISTORY_LINK_SECRET || process.env.SUPABASE_APP_SERVICE_ROLE_KEY || '';
}

function sign(patientId, exp, key) {
  return crypto.createHmac('sha256', key).update(`patient-history:${patientId}:${exp}`).digest('base64url').slice(0, 32);
}

// The query string for a new link: ?exp=<unix seconds>&sig=<signature>.
export function historyLinkQuery(patientId, { now = Date.now(), key = secret() } = {}) {
  const exp = Math.floor(now / 1000) + HISTORY_LINK_DAYS * 24 * 60 * 60;
  return `exp=${exp}&sig=${sign(patientId, exp, key)}`;
}

export function historyLinkValid(patientId, exp, sig, { now = Date.now(), key = secret() } = {}) {
  if (!key || !exp || !sig || !/^\d+$/.test(String(exp))) return false;
  if (Number(exp) * 1000 < now) return false;
  const expected = Buffer.from(sign(patientId, Number(exp), key));
  const given = Buffer.from(String(sig));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
