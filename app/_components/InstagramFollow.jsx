// app/_components/InstagramFollow.jsx
// "Follow us on Instagram" on the screens owners see when they've just done
// something with us (the intake form, a signed consent form): a good moment
// to ask, and the cheapest way to grow followers (lib/clinicSocial.js).

import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from '@/lib/clinicSocial';

export default function InstagramFollow() {
  return (
    <a className="instagram-follow" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
      <span className="instagram-follow-icon" aria-hidden="true">📸</span>
      <span>
        <strong>Follow us on Instagram</strong>
        <span className="instagram-follow-sub">@{INSTAGRAM_HANDLE} · our patients and the team</span>
      </span>
    </a>
  );
}
