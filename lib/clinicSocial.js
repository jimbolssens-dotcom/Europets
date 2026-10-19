// lib/clinicSocial.js
// The clinic's Instagram, for inviting clients to follow it: the
// concierge's warm sign-offs (lib/conciergeSituation.js), the PDFs sent to
// owners, the portal's thank-you pages and the reception QR card
// (app/(admin)/social/qr-card).

export const INSTAGRAM_HANDLE = 'europetsclinic';
export const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}`;
// How it reads in a message or on paper: short, and still a working link.
export const INSTAGRAM_SHORT = `instagram.com/${INSTAGRAM_HANDLE}`;

// The concierge invites a client at most once in this many days.
export const INSTAGRAM_INVITE_DAYS = 60;
